import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem, GachaWinRecord } from '@/types/gacha';
import {
  createInitialGachaBoxes,
  GACHA_DEFAULT_REWARD_AMOUNT,
  GACHA_PHYSICS,
} from '@/constants/gacha';
import {
  getAllMemberTicketBalances,
  getOrInitMachineState,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeQuat(q: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Array.isArray(q) || q.length !== 4) return fallback;
  const nums = q.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const len = Math.hypot(nums[0], nums[1], nums[2], nums[3]);
  if (len < 1e-6) return fallback;
  return [nums[0] / len, nums[1] / len, nums[2] / len, nums[3] / len];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { turnId, member, updatedItems, wonItemIds } = body || {};

    if (!turnId || !member) {
      return NextResponse.json(
        { success: false, message: 'turnId와 member 정보가 필요합니다.' },
        { status: 400 }
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
    const rawMachine = (await col.findOne({ _id: 'main_ufo_bridge' as any })) as any;

    if (!rawMachine) {
      const fresh = await getOrInitMachineState(db);
      return NextResponse.json({
        success: false,
        message: '뽑기 기계 상태를 찾을 수 없어 초기화되었습니다.',
        machine: sanitizeMachineForClient(fresh),
      }, { status: 404 });
    }

    const now = Date.now();
    const lock = rawMachine.lock;
    const isSameTurn = lock?.turnId === turnId && lock?.member === member;
    const withinGrace = lock?.expiresAt ? now <= lock.expiresAt + 20000 : true;

    if (!isSameTurn || !withinGrace) {
      return NextResponse.json(
        { success: false, message: '유효하지 않거나 만료된 뽑기 턴입니다.' },
        { status: 409 }
      );
    }

    const currentItems: GachaBoxItem[] = Array.isArray(rawMachine.items) ? rawMachine.items : [];
    const wonSet = new Set<string>(Array.isArray(wonItemIds) ? wonItemIds.map(String) : []);
    const updatedMap = new Map<string, { position: unknown; quaternion: unknown }>();
    if (Array.isArray(updatedItems)) {
      for (const it of updatedItems) {
        if (it?.id) {
          updatedMap.set(String(it.id), it);
        }
      }
    }

    const remainingItems: GachaBoxItem[] = [];
    const wonBoxes: GachaBoxItem[] = [];

    for (const orig of currentItems) {
      const upd = updatedMap.get(orig.id);
      const nextPos: [number, number, number] = upd && Array.isArray(upd.position) && upd.position.length === 3
        ? [
            clampNumber(upd.position[0], -GACHA_PHYSICS.CABINET_HALF_X, GACHA_PHYSICS.CABINET_HALF_X, orig.position[0]),
            clampNumber(upd.position[1], -2.0, 2.8, orig.position[1]),
            clampNumber(upd.position[2], -GACHA_PHYSICS.CABINET_HALF_Z, GACHA_PHYSICS.CABINET_HALF_Z, orig.position[2]),
          ]
        : orig.position;

      const isWon = wonSet.has(orig.id) || nextPos[1] < GACHA_PHYSICS.DROP_Y_THRESHOLD;
      if (isWon) {
        wonBoxes.push(orig);
      } else {
        remainingItems.push({
          ...orig,
          position: nextPos,
          quaternion: upd ? normalizeQuat(upd.quaternion, orig.quaternion) : orig.quaternion,
        });
      }
    }

    // 당첨 처리 (개별 뽑기 시에는 즉시 리필하지 않고, 4개 상품이 모두 뽑혀 비었을 때 4개 일괄 리필)
    const wonRecords: GachaWinRecord[] = [];
    for (let i = 0; i < wonBoxes.length; i++) {
      const won = wonBoxes[i];
      const rewardAmount =
        typeof won.rewardAmount === 'number' ? won.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT;
      const winRecord: GachaWinRecord = {
        id: `gwin_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        member,
        boxId: won.id,
        boxLabel: won.label,
        colorTheme: won.colorTheme,
        rewardType: won.rewardType || 'SOL',
        rewardAmount,
        unboxed: false,
        claimStatus: 'unclaimed',
        notified: false,
        createdAt: now + i,
      };
      wonRecords.push(winRecord);
    }

    let didFullRefill = false;
    if (remainingItems.length === 0) {
      remainingItems.push(...createInitialGachaBoxes());
      didFullRefill = true;
    }

    if (wonRecords.length > 0) {
      await db.collection('gacha_wins').insertMany(wonRecords.map((r) => ({ ...r, _id: r.id as any })));
      await db.collection('gacha_tickets').updateOne(
        { _id: member as any },
        { $inc: { totalWins: wonRecords.length }, $set: { updatedAt: now } }
      );
    }

    // slotIndex 순 정렬
    remainingItems.sort((a, b) => a.slotIndex - b.slotIndex);

    const actionSummary =
      wonRecords.length > 0
        ? didFullRefill
          ? `🎉 ${member}님이 마지막 ${wonRecords.map((w) => w.boxLabel).join(', ')} 뽑기에 성공! 4개 모두 뽑혀 새 상품 4개가 리필되었습니다.`
          : `🎉 ${member}님이 ${wonRecords.map((w) => w.boxLabel).join(', ')} 뽑기에 성공했습니다! (남은 상품 ${remainingItems.length}개)`
        : `${member}님이 크레인을 조작하여 상자 위치를 움직였습니다.`;

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    const nextMachine = await col.findOneAndUpdate(
      { _id: 'main_ufo_bridge' as any },
      {
        $set: {
          items: remainingItems,
          lock: clearedLock,
          lastPlayedBy: member,
          lastPlayedAt: now,
          lastActionSummary: actionSummary,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    const ticketsByMember = await getAllMemberTicketBalances(db);

    return NextResponse.json({
      success: true,
      wonRecords,
      machine: sanitizeMachineForClient((nextMachine || rawMachine) as any),
      ticketsByMember,
    });
  } catch (error: any) {
    console.error('Failed to finish gacha turn:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 결과 저장 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
