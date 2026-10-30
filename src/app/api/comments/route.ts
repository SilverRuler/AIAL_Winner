import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MealComment } from '@/types/meal';
import { getClientIp, maskIp } from '@/lib/ip';
import { MEMBERS } from '@/constants/members';

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

    if (!mealId || !commentId) {
      return NextResponse.json(
        { success: false, message: 'mealId와 commentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (db) {
      await db.collection('meals').updateOne(
        { $or: [{ id: mealId }, { _id: mealId as any }] },
        { $pull: { comments: { id: commentId } } as any }
      );
    }

    return NextResponse.json({
      success: true,
      message: '댓글이 삭제되었습니다.',
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
