import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import {
  createBoxForSlot,
  createInitialGachaBoxes,
  getBoxDimensions,
  getNearestSeatIndex,
  getRestingBoxPosition,
  shuffleIndices,
} from '@/constants/gacha';
import { isAdminAuthorized, recordGachaLog, sanitizeMachineForClient } from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!isAdminAuthorized(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자만 뽑기판을 리필할 수 있습니다.' },
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
    const currentItems: GachaBoxItem[] = Array.isArray(existing?.items) ? existing.items : [];

    const occupiedSlots = new Set(currentItems.map((it) => it.slotIndex));
    const missingSlots = [0, 1, 2, 3].filter((idx) => !occupiedSlots.has(idx));

    if (missingSlots.length === 0) {
      return NextResponse.json({
        success: true,
        refilledCount: 0,
        message: '이미 4개 상품이 모두 채워져 있습니다.',
        machine: sanitizeMachineForClient(existing as any),
      });
    }

    let nextItems: GachaBoxItem[];
    if (currentItems.length === 0) {
      // 4개 모두 뽑힌 상태 -> 4개 전부 랜덤 순서로 새로 리필
      nextItems = createInitialGachaBoxes();
    } else {
      // 일부(1~3개)만 뽑힌 상태 -> 남은 상품 위치는 유지하고 빈 좌석에 빠진 상품들을 랜덤 배치로 리필
      nextItems = [...currentItems];
      const usedSeats = new Set<number>(
        nextItems.map((it) =>
          typeof it.seatIndex === 'number' ? it.seatIndex : getNearestSeatIndex(it.position[0])
        )
      );
      const freeSeats = shuffleIndices([0, 1, 2, 3].filter((s) => !usedSeats.has(s)));
      const shuffledMissing = shuffleIndices(missingSlots);

      for (let i = 0; i < shuffledMissing.length; i++) {
        const slotIdx = shuffledMissing[i];
        const seatIdx = freeSeats[i] !== undefined ? freeSeats[i] : slotIdx;
        const newBox = createBoxForSlot(slotIdx, now + i * 10, seatIdx);
        const [rx, ry, rz] = getRestingBoxPosition(slotIdx, seatIdx);
        const overlapsExisting = nextItems.some(
          (item) => Math.abs(item.position[0] - rx) < 0.92 && item.position[1] > 0.35
        );
        if (overlapsExisting) {
          const { h } = getBoxDimensions(slotIdx);
          newBox.position = [rx, ry + h + 0.25, rz];
        }
        nextItems.push(newBox);
      }
      nextItems.sort((a, b) => (a.seatIndex ?? a.slotIndex) - (b.seatIndex ?? b.slotIndex));
    }

    const refilledCount = missingSlots.length;
    const summary =
      refilledCount === 4
        ? '📦 운영자(관리자)가 4개 상품을 모두 새로 리필했습니다!'
        : `📦 운영자(관리자)가 빈 자리 상품 ${refilledCount}개를 리필했습니다! (총 ${nextItems.length}개)`;

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    const updated = await col.findOneAndUpdate(
      { _id: 'main_ufo_bridge' as any },
      {
        $set: {
          id: 'main_ufo_bridge',
          items: nextItems,
          lock: clearedLock,
          lastActionSummary: summary,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await recordGachaLog(db, {
      type: 'admin_refill',
      member: '관리자',
      message: summary,
      meta: { refilledCount, totalStock: nextItems.length },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      refilledCount,
      message: summary,
      machine: sanitizeMachineForClient(updated as any),
    });
  } catch (error: any) {
    console.error('Failed to refill gacha machine:', error);
    return NextResponse.json(
      { success: false, message: '뽑기판 리필 실패', error: error.message },
      { status: 500 }
    );
  }
}
