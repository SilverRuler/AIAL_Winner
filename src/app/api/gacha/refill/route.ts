import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import {
  createSingleMachineItems,
  GACHA_ALL_SLOT_INDICES,
  GACHA_TOTAL_SLOTS,
  getMachineDocId,
  getMachineLabel,
  isPlushSlot,
  normalizeMachineIndex,
  PLUSH_MOUND_COUNT,
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
    const now = Date.now();
    const refillAll = Boolean(body?.all);
    const targetIndices = refillAll
      ? [...GACHA_ALL_SLOT_INDICES]
      : [normalizeMachineIndex(body?.machineIndex, 0)];

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    const refilledLabels: string[] = [];

    for (const idx of targetIndices) {
      const docId = getMachineDocId(idx);
      const machineLabel = getMachineLabel(idx);
      const existing = (await col.findOne({ _id: docId as any })) as any;
      const existingCount = Array.isArray(existing?.items) ? existing.items.length : 0;
      const targetFullCount = isPlushSlot(idx) ? PLUSH_MOUND_COUNT : 1;
      if (existingCount >= targetFullCount) continue;

      const freshItems = createSingleMachineItems(idx, now + idx * 10);
      const summary = `📦 운영자(관리자)가 [${idx + 1}번 뽑기판] ${machineLabel}을(를) 새로 리필했습니다!`;

      await col.updateOne(
        { _id: docId as any },
        {
          $set: {
            id: docId,
            machineIndex: idx,
            slotIndex: idx,
            machineLabel,
            items: freshItems,
            lock: clearedLock,
            lastActionSummary: summary,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      refilledLabels.push(`${idx + 1}번 ${machineLabel}`);
    }

    const machines = (await getAllMachineStates(db)).map(sanitizeMachineForClient);
    const primaryIdx = targetIndices[0] ?? 0;

    if (refilledLabels.length === 0) {
      return NextResponse.json({
        success: true,
        refilledCount: 0,
        message: refillAll
          ? `이미 ${GACHA_TOTAL_SLOTS}개 뽑기판 모두 상품이 채워져 있습니다.`
          : `[${primaryIdx + 1}번 뽑기판] ${getMachineLabel(primaryIdx)}은(는) 이미 상품이 채워져 있습니다.`,
        machineIndex: primaryIdx,
        machine: machines[primaryIdx],
        machines,
      });
    }

    const totalStock = machines.reduce((sum, m) => sum + m.items.length, 0);
    const summary = refillAll
      ? `📦 운영자(관리자)가 빈 뽑기판 ${refilledLabels.length}개를 리필했습니다! (전체 ${totalStock}/${GACHA_TOTAL_SLOTS}개)`
      : `📦 운영자(관리자)가 [${primaryIdx + 1}번 뽑기판] ${getMachineLabel(primaryIdx)}을(를) 리필했습니다!`;

    await recordGachaLog(db, {
      type: 'admin_refill',
      member: '관리자',
      message: summary,
      meta: { refillAll, machineIndex: primaryIdx, refilledCount: refilledLabels.length, totalStock },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      refilledCount: refilledLabels.length,
      message: summary,
      machineIndex: primaryIdx,
      machine: machines[primaryIdx],
      machines,
    });
  } catch (error: any) {
    console.error('Failed to refill gacha machine:', error);
    return NextResponse.json(
      { success: false, message: '뽑기판 리필 실패', error: error.message },
      { status: 500 }
    );
  }
}
