import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getClientIp, normalizeIp } from '@/lib/ip';

/**
 * POST /api/meals/like
 * 게시글 좋아요 토글 (1개 IP당 1회만 카운트, 재클릭 시 좋아요 취소)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mealId, action } = body;

    if (!mealId) {
      return NextResponse.json(
        { success: false, message: '게시글 ID(mealId)가 필요합니다.' },
        { status: 400 }
      );
    }

    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || '127.0.0.1';

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    // 1. 대상 게시글 조회
    const existing = await db.collection('meals').findOne({
      $or: [{ id: mealId }, { _id: mealId as any }],
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: '게시글을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const currentLikedIps: string[] = Array.isArray(existing.likedIps) ? existing.likedIps : [];
    const hasAlreadyLiked = currentLikedIps.includes(clientIp);

    // action이 명시되지 않은 경우 toggle로 동작
    const shouldUnlike = action === 'unlike' || (action !== 'like' && hasAlreadyLiked);

    if (shouldUnlike) {
      if (!hasAlreadyLiked) {
        // 이미 좋아요 상태가 아님
        return NextResponse.json({
          success: true,
          liked: false,
          likes: Math.max(0, typeof existing.likes === 'number' ? existing.likes : 0),
          message: '좋아요를 누르지 않은 상태입니다.',
        });
      }

      // 이미 해당 IP로 좋아요를 누른 상태 -> 원자적 취소 ($pull, $inc: -1)
      const result = await db.collection('meals').findOneAndUpdate(
        {
          $or: [{ id: mealId }, { _id: mealId as any }],
          likedIps: clientIp,
        },
        {
          $inc: { likes: -1 },
          $pull: { likedIps: clientIp } as any,
        },
        { returnDocument: 'after' }
      );

      const finalLikes = Math.max(0, typeof result?.likes === 'number' ? result.likes : (existing.likes ? existing.likes - 1 : 0));

      // likes 필드가 음수로 저장되는 것 방지
      if (result && typeof result.likes === 'number' && result.likes < 0) {
        await db.collection('meals').updateOne(
          { $or: [{ id: mealId }, { _id: mealId as any }] },
          { $set: { likes: 0 } }
        );
      }

      return NextResponse.json({
        success: true,
        liked: false,
        likes: finalLikes,
        message: '좋아요가 취소되었습니다.',
      });
    } else {
      if (hasAlreadyLiked) {
        // 이미 좋아요를 누른 상태에서 추가 요청
        return NextResponse.json({
          success: true,
          liked: true,
          likes: typeof existing.likes === 'number' ? existing.likes : 1,
          message: '이미 좋아요를 누르셨습니다.',
        });
      }

      // 아직 해당 IP로 좋아요를 누르지 않은 상태 -> 원자적 추가 ($addToSet, $inc: 1)
      const result = await db.collection('meals').findOneAndUpdate(
        {
          $or: [{ id: mealId }, { _id: mealId as any }],
          likedIps: { $ne: clientIp },
        },
        {
          $inc: { likes: 1 },
          $addToSet: { likedIps: clientIp } as any,
        },
        { returnDocument: 'after' }
      );

      const finalLikes = typeof result?.likes === 'number' ? result.likes : ((existing.likes || 0) + 1);

      return NextResponse.json({
        success: true,
        liked: true,
        likes: finalLikes,
        message: '좋아요가 반영되었습니다.',
      });
    }
  } catch (error: any) {
    console.error('Failed to toggle meal like:', error);
    return NextResponse.json(
      { success: false, message: '좋아요 처리 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
