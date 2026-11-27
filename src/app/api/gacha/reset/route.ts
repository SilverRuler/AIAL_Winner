import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import {
  createSingleMachineItems,
  GACHA_ALL_SLOT_INDICES,
  getMachineDocId,
  getMachineLabel,
  getPlushMoundPose,
  getRestingBoxPosition,
  isPlushSlot,
  normalizeMachineIndex,
} from '@/constants/gacha';
import {
  getAllMachineStates,
  isAdminAuthorized,
  recordGachaLog,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';

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
    const now = Date.now();
    const resetAll = Boolean(body?.all);
    const targetIndices = resetAll
      ? [...GACHA_ALL_SLOT_INDICES]
      : [normalizeMachineIndex(body?.machineIndex, 0)];

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    let resetCountTotal = 0;

    for (const idx of targetIndices) {
      const docId = getMachineDocId(idx);
      const machineLabel = getMachineLabel(idx);
      const existing = (await col.findOne({ _id: docId as any })) as any;

      let resetItems: GachaBoxItem[];
      if (!existing || !Array.isArray(existing.items)) {
        resetItems = createSingleMachineItems(idx, now);
      } else {
        const plushMachine = isPlushSlot(idx);
        resetItems = existing.items.map((item: GachaBoxItem, arrIdx: number) => {
          const pose = plushMachine
            ? getPlushMoundPose(idx, arrIdx)
            : {
                position: getRestingBoxPosition(idx, 0),
                quaternion: [0, 0, 0, 1] as [number, number, number, number],
              };
          return {
            ...item,
            slotIndex: idx,
            seatIndex: arrIdx,
            position: pose.position,
            quaternion: pose.quaternion,
            isInitialState: true,
          };
        });
      }

      if (resetItems.length === 0) {
        await col.updateOne(
          { _id: docId as any },
          { $set: { lock: clearedLock, updatedAt: now } }
        );
        continue;
      }

      resetCountTotal += 1;
      const summary = `🔄 운영자(관리자)가 [${idx + 1}번 뽑기판] ${machineLabel}을(를) 중앙 정위치로 재정비했습니다.`;

      await col.updateOne(
        { _id: docId as any },
        {
          $set: {
            id: docId,
            machineIndex: idx,
            slotIndex: idx,
            machineLabel,
            items: resetItems,
            lock: clearedLock,
            lastActionSummary: summary,
            updatedAt: now,
          },
          $inc: { resetCount: 1 },
        },
        { upsert: true }
      );
    }

    const machines = (await getAllMachineStates(db)).map(sanitizeMachineForClient);
    const primaryIdx = targetIndices[0] ?? 0;

    if (resetCountTotal === 0) {
      return NextResponse.json({
        success: true,
        message: '초기화할 남은 상품이 없습니다. [뽑기판 리필] 버튼을 눌러 상품을 보충하세요.',
        machineIndex: primaryIdx,
        machine: machines[primaryIdx],
        machines,
      });
    }

    const logSummary = resetAll
      ? `🔄 운영자(관리자)가 전체 뽑기판 중 남은 상품 ${resetCountTotal}개를 중앙 정위치로 재정비했습니다.`
      : `🔄 운영자(관리자)가 [${primaryIdx + 1}번 뽑기판] ${getMachineLabel(primaryIdx)}을(를) 중앙 정위치로 재정비했습니다.`;

    await recordGachaLog(db, {
      type: 'admin_reset',
      member: '관리자',
      message: logSummary,
      meta: { resetAll, machineIndex: primaryIdx, resetCountTotal },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: logSummary,
      machineIndex: primaryIdx,
      machine: machines[primaryIdx],
      machines,
    });
  } catch (error: any) {
    console.error('Failed to reset gacha machine:', error);
    return NextResponse.json(
      { success: false, message: '뽑기판 초기화 실패', error: error.message },
      { status: 500 }
    );
  }
}
