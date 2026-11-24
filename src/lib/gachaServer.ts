import { NextRequest } from 'next/server';
import { Db } from 'mongodb';
import {
  GachaBoxItem,
  GachaMachineState,
  GachaTicketBalance,
} from '@/types/gacha';
import {
  createBoxForSlot,
  createInitialGachaBoxes,
  GACHA_PHYSICS,
  GACHA_SLOT_X,
  getRestingBoxPosition,
  sanitizeBoxForClient,
} from '@/constants/gacha';
import { MEMBERS } from '@/constants/members';

export const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
export const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

export function isAdminAuthorized(request: NextRequest, body?: any): boolean {
  const reqId = body?.adminId || request.headers.get('x-admin-id');
  const reqPw = body?.adminPw || request.headers.get('x-admin-pw');
  return reqId === ADMIN_ID && reqPw === ADMIN_PW;
}

export function getTelegramConfig() {
  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    Buffer.from('ODc3ODI4MjAwMTpBQUdwNUZUVi10akFKY21lS3V2aGRtRDhESkNQMl9haV8tYw==', 'base64').toString('utf-8');
  const chatId =
    process.env.TELEGRAM_CHAT_ID ||
    Buffer.from('MTc3Nzk1MjQ1Nw==', 'base64').toString('utf-8');
  return { token, chatId };
}

/**
 * 식사 등록 또는 관리자 지급 시 멤버에게 뽑기권 부여
 */
export async function grantGachaTickets(db: Db, member: string, amount = 1): Promise<number> {
  const now = Date.now();
  if (amount < 0) {
    const current = (await db.collection('gacha_tickets').findOne({ _id: member as any })) as any;
    const curTickets = Math.max(0, Number(current?.tickets) || 0);
    const nextTickets = Math.max(0, curTickets + amount);
    await db.collection('gacha_tickets').updateOne(
      { _id: member as any },
      {
        $set: { member, tickets: nextTickets, updatedAt: now },
        $setOnInsert: { totalEarned: 0, totalPlayed: 0, totalWins: 0 },
      },
      { upsert: true }
    );
    return nextTickets;
  }

  const res = await db.collection('gacha_tickets').findOneAndUpdate(
    { _id: member as any },
    {
      $inc: { tickets: amount, totalEarned: amount },
      $set: { member, updatedAt: now },
      $setOnInsert: { totalPlayed: 0, totalWins: 0 },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return typeof res?.tickets === 'number' ? res.tickets : amount;
}

/**
 * 전체 12인 멤버의 뽑기권 보유 현황 조회
 */
export async function getAllMemberTicketBalances(db: Db): Promise<Record<string, GachaTicketBalance>> {
  const docs = await db.collection('gacha_tickets').find({}).toArray();
  const map: Record<string, GachaTicketBalance> = {};

  for (const m of MEMBERS) {
    map[m.name] = {
      member: m.name,
      tickets: 0,
      totalEarned: 0,
      totalPlayed: 0,
      totalWins: 0,
      updatedAt: 0,
    };
  }

  for (const doc of docs as any[]) {
    const name = doc.member || String(doc._id);
    map[name] = {
      member: name,
      tickets: Math.max(0, Number(doc.tickets) || 0),
      totalEarned: Math.max(0, Number(doc.totalEarned) || 0),
      totalPlayed: Math.max(0, Number(doc.totalPlayed) || 0),
      totalWins: Math.max(0, Number(doc.totalWins) || 0),
      updatedAt: Number(doc.updatedAt) || 0,
    };
  }

  return map;
}

/**
 * 공유 UFO 크레인 머신 상태 조회 (미생성 시 초기화, 만료된 락 자동 해제)
 */
export async function getOrInitMachineState(db: Db): Promise<GachaMachineState> {
  const col = db.collection('gacha_machine');
  const existing = (await col.findOne({ _id: 'main_ufo_bridge' as any })) as any;
  const now = Date.now();

  if (!existing || !Array.isArray(existing.items)) {
    const initial: GachaMachineState = {
      id: 'main_ufo_bridge',
      items: createInitialGachaBoxes(),
      lock: {
        active: false,
        member: null,
        turnId: null,
        startedAt: null,
        expiresAt: null,
      },
      lastPlayedBy: null,
      lastPlayedAt: null,
      lastActionSummary: 'UFO 브릿지 뽑기판이 준비되었습니다!',
      resetCount: existing?.resetCount || 0,
      updatedAt: now,
    };

    await col.updateOne(
      { _id: 'main_ufo_bridge' as any },
      { $set: initial },
      { upsert: true }
    );
    return initial;
  }

  // 만료된 턴 락 자동 해제
  if (existing.lock?.active && existing.lock?.expiresAt && existing.lock.expiresAt < now) {
    const expiredMember = existing.lock.member;
    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };
    await col.updateOne(
      { _id: 'main_ufo_bridge' as any },
      {
        $set: {
          lock: clearedLock,
          lastActionSummary: expiredMember
            ? `${expiredMember}님의 조작 시간이 만료되어 기계 잠금이 해제되었습니다.`
            : existing.lastActionSummary,
          updatedAt: now,
        },
      }
    );
    existing.lock = clearedLock;
  }

  return {
    id: 'main_ufo_bridge',
    items: existing.items,
    lock: existing.lock || {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    },
    lastPlayedBy: existing.lastPlayedBy || null,
    lastPlayedAt: existing.lastPlayedAt || null,
    lastActionSummary: existing.lastActionSummary || null,
    resetCount: existing.resetCount || 0,
    updatedAt: existing.updatedAt || now,
  };
}

/**
 * 클라이언트 노출용 머신 상태 정제 (박스별 내부 보상 정보 숨김)
 */
export function sanitizeMachineForClient(machine: GachaMachineState): GachaMachineState {
  return {
    ...machine,
    items: machine.items.map((b) => sanitizeBoxForClient(b) as GachaBoxItem),
  };
}

/**
 * 뽑힌 슬롯을 자동으로 안전하게 리필 (기존 박스와 겹침 방지)
 */
export function refillWonSlot(remainingItems: GachaBoxItem[], wonSlotIndex: number, nowTs: number): GachaBoxItem {
  const isSlotClear = (idx: number) => {
    const targetX = GACHA_SLOT_X[idx];
    return !remainingItems.some(
      (item) => Math.abs(item.position[0] - targetX) < 0.92 && item.position[1] > 0.35
    );
  };

  let chosenSlot = wonSlotIndex;
  if (!isSlotClear(chosenSlot)) {
    const freeIdx = [0, 1, 2, 3].find((idx) => isSlotClear(idx));
    if (freeIdx !== undefined) {
      chosenSlot = freeIdx;
    }
  }

  const newBox = createBoxForSlot(chosenSlot, nowTs);
  if (!isSlotClear(chosenSlot)) {
    // 모든 자리에 인접 박스가 걸쳐있다면 약간 위에서 떨어뜨려 겹침 방지
    const [rx, ry, rz] = getRestingBoxPosition(chosenSlot);
    newBox.position = [rx, ry + GACHA_PHYSICS.BOX_H + 0.25, rz];
  }
  return newBox;
}
