import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MealComment } from '@/types/meal';
import { getClientIp, maskIp, normalizeIp } from '@/lib/ip';
import { MEMBERS } from '@/constants/members';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mealId, author, content } = body;

    if (!mealId) {
      return NextResponse.json(
        { success: false, message: '게시글 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const trimmedAuthor = (author || '').trim();
    const trimmedContent = (content || '').trim();

    if (!trimmedAuthor) {
      return NextResponse.json(
        { success: false, message: '댓글 작성자 닉네임을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!trimmedContent) {
      return NextResponse.json(
        { success: false, message: '댓글 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 클라이언트 IP 추출 (12인 멤버 칩 선택 시 화면 노출용 maskedIp는 생략)
    const clientIp = getClientIp(request);
    const isMember = MEMBERS.some((m) => m.name === trimmedAuthor);
    const maskedIp = isMember ? undefined : maskIp(clientIp);

    const newComment: MealComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      author: trimmedAuthor,
      content: trimmedContent,
      createdAt: Date.now(),
      ip: clientIp, // 몽고디비 원본 full IP 기록
      maskedIp: maskedIp, // 유동닉일 때만 (211.123) 마스킹 IP 설정
    };

    const db = await getDatabase();
    if (db) {
      const result = await db.collection('meals').updateOne(
        { $or: [{ id: mealId }, { _id: mealId as any }] },
        { $push: { comments: newComment } as any }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { success: false, message: '해당 식사 게시글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    // 클라이언트 응답 시 원본 full IP는 보안상 제외하고 마스킹된 IP만 반환
    const responseComment: MealComment = {
      ...newComment,
      ip: undefined,
    };

    return NextResponse.json({
      success: true,
      message: '댓글이 성공적으로 등록되었습니다.',
      comment: responseComment,
    });
  } catch (error: any) {
    console.error('Failed to post comment:', error);
    return NextResponse.json(
      { success: false, message: '댓글 등록 실패', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mealId = searchParams.get('mealId');
    const commentId = searchParams.get('commentId');
    const adminId = searchParams.get('adminId') || request.headers.get('x-admin-id');
    const adminPw = searchParams.get('adminPw') || request.headers.get('x-admin-pw');

    if (!mealId || !commentId) {
      return NextResponse.json(
        { success: false, message: 'mealId와 commentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const isAdmin = adminId === ADMIN_ID && adminPw === ADMIN_PW;

    const db = await getDatabase();
    if (db) {
      // 1) 대상 식사 게시글 및 해당 댓글 조회
      const meal = await db.collection('meals').findOne({
        $or: [{ id: mealId }, { _id: mealId as any }],
      });

      if (!meal) {
        return NextResponse.json(
          { success: false, message: '해당 식사 게시글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const comments = Array.isArray(meal.comments) ? meal.comments : [];
      const targetComment = comments.find((c: any) => c.id === commentId);

      if (!targetComment) {
        return NextResponse.json(
          { success: false, message: '삭제할 댓글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (targetComment.isDeleted) {
        return NextResponse.json(
          { success: false, message: '이미 삭제된 댓글입니다.' },
          { status: 400 }
        );
      }

      // 2) 관리자가 아닐 때 접속 기기(IP) 일치 여부 확인
      if (!isAdmin) {
        // IP 컬럼 적용 이전에 등록된 구형 댓글인 경우: 작성 기기 식별이 불가하므로 오직 관리자만 삭제 가능
        if (!targetComment.ip || !targetComment.ip.trim()) {
          return NextResponse.json(
            {
              success: false,
              requireAdmin: true,
              message:
                'IP 기록 기능 적용 전에 등록된 댓글은 관리자만 삭제할 수 있습니다.',
            },
            { status: 403 }
          );
        }

        const commentIpNorm = normalizeIp(targetComment.ip);
        const clientIpNorm = normalizeIp(clientIp);

        // 현재 접속한 클라이언트 IP와 댓글 작성 당시 IP가 불일치하는 경우
        if (!commentIpNorm || commentIpNorm !== clientIpNorm) {
          return NextResponse.json(
            {
              success: false,
              requireAdmin: true,
              message:
                '본인이 작성한 기기(IP)에서만 삭제할 수 있습니다. (작성 기기 IP 불일치)',
            },
            { status: 403 }
          );
        }
      }

      // 3) 몽고디비 원본 기록 보존을 위해 완전 삭제($pull) 대신 소프트 딜리트(isDeleted: true) 적용
      await db.collection('meals').updateOne(
        {
          $or: [{ id: mealId }, { _id: mealId as any }],
          'comments.id': commentId,
        },
        {
          $set: {
            'comments.$.isDeleted': true,
            'comments.$.deletedAt': Date.now(),
            'comments.$.deletedBy': isAdmin ? 'admin' : 'author_ip',
            'comments.$.deletedIp': clientIp,
          },
        } as any
      );
    }

    return NextResponse.json({
      success: true,
      message: isAdmin ? '관리자 권한으로 댓글이 삭제되었습니다.' : '댓글이 삭제되었습니다.',
      commentId,
    });
  } catch (error: any) {
    console.error('Failed to delete comment:', error);
    return NextResponse.json(
      { success: false, message: '댓글 삭제 실패', error: error.message },
      { status: 500 }
    );
  }
}
