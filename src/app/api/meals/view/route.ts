import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getClientIp, normalizeIp } from '@/lib/ip';

/**
 * POST /api/meals/view
 * 게시글 클릭 시 조회수 1 증가 (1개 IP당 1회만 카운트)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mealId } = body;

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

    // 1개의 IP당 1회만 조회수가 증가하도록 $ne 조건과 $addToSet을 조합한 원자적 갱신
    const result = await db.collection('meals').findOneAndUpdate(
      {
        $or: [{ id: mealId }, { _id: mealId as any }],
        viewedIps: { $ne: clientIp },
      },
      {
        $inc: { views: 1 },
        $addToSet: { viewedIps: clientIp } as any,
      },
      { returnDocument: 'after' }
    );

    if (result) {
      // 해당 IP에서 최초 조회 -> 1 증가 성공
      const updatedViews = typeof result.views === 'number' ? result.views : 1;
      return NextResponse.json({
        success: true,
        incremented: true,
        views: updatedViews,
      });
    }

    // 이미 해당 IP가 조회했거나 게시글이 없는 경우
    const existing = await db.collection('meals').findOne(
      { $or: [{ id: mealId }, { _id: mealId as any }] },
      { projection: { views: 1 } }
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, message: '게시글을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 카운트된 IP인 경우 기존 조회수 반환
    return NextResponse.json({
      success: true,
      incremented: false,
      views: typeof existing.views === 'number' ? existing.views : 0,
    });
  } catch (error: any) {
    console.error('Failed to increment meal view:', error);
    return NextResponse.json(
      { success: false, message: '조회수 집계 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
