import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { createInitialGachaBoxes } from '@/constants/gacha';
import { isAdminAuthorized, sanitizeMachineForClient } from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!isAdminAuthorized(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자만 뽑기판을 초기화할 수 있습니다.' },
        { status: 403 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const now = Date.now();
    const initialBoxes = createInitialGachaBoxes();
    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    const updated = await db.collection('gacha_machine').findOneAndUpdate(
      { _id: 'main_ufo_bridge' as any },
      {
        $set: {
          id: 'main_ufo_bridge',
          items: initialBoxes,
          lock: clearedLock,
          lastActionSummary: '🔄 운영자(관리자)가 뽑기판 상자 위치를 초기 상태로 재정비했습니다.',
          updatedAt: now,
        },
        $inc: { resetCount: 1 },
      },
      { upsert: true, returnDocument: 'after' }
    );

    return NextResponse.json({
      success: true,
      message: '뽑기판이 초기 정위치로 재세팅되었습니다.',
      machine: sanitizeMachineForClient(updated as any),
    });
  } catch (error: any) {
    console.error('Failed to reset gacha machine:', error);
    return NextResponse.json(
      { success: false, message: '뽑기판 초기화 실패', error: error.message },
      { status: 500 }
    );
  }
}
