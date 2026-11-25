import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import { createInitialGachaBoxes, getRestingBoxPosition } from '@/constants/gacha';
import { isAdminAuthorized, recordGachaLog, sanitizeMachineForClient } from '@/lib/gachaServer';

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

    const col = db.collection('gacha_machine');
    const existing = (await col.findOne({ _id: 'main_ufo_bridge' as any })) as any;
    const now = Date.now();

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    // 기존 문서가 아예 없는 경우에만 최초 4개 생성, 그 외에는 현재 남아있는 상품들만 정위치로 복귀
    let resetItems: GachaBoxItem[];
    if (!existing || !Array.isArray(existing.items)) {
      resetItems = createInitialGachaBoxes();
    } else {
      resetItems = existing.items.map((item: GachaBoxItem) => ({
        ...item,
        position: getRestingBoxPosition(item.slotIndex),
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
      }));
      resetItems.sort((a, b) => a.slotIndex - b.slotIndex);
    }

    if (resetItems.length === 0) {
      const updatedEmpty = await col.findOneAndUpdate(
        { _id: 'main_ufo_bridge' as any },
        {
          $set: {
            lock: clearedLock,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      return NextResponse.json({
        success: true,
        message: '초기화할 남은 상품이 없습니다. [뽑기판 리필] 버튼을 눌러 상품을 보충하세요.',
        machine: sanitizeMachineForClient((updatedEmpty || existing) as any),
      });
    }

    const summary = `🔄 운영자(관리자)가 남은 상품 ${resetItems.length}개를 초기 정위치로 재정비했습니다.`;

    const updated = await col.findOneAndUpdate(
      { _id: 'main_ufo_bridge' as any },
      {
        $set: {
          id: 'main_ufo_bridge',
          items: resetItems,
          lock: clearedLock,
          lastActionSummary: summary,
          updatedAt: now,
        },
        $inc: { resetCount: 1 },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await recordGachaLog(db, {
      type: 'admin_reset',
      member: '관리자',
      message: summary,
      meta: { remainingStock: resetItems.length },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: `남아있는 상품 ${resetItems.length}개가 초기 정위치로 재세팅되었습니다.`,
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
