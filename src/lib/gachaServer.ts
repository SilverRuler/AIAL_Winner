import { NextRequest } from 'next/server';
import { Db } from 'mongodb';
import {
  GachaBoxItem,
  GachaMachineState,
  GachaTicketBalance,
} from '@/types/gacha';
import {
  createBoxForSlot,
  createSingleMachineItems,
  GACHA_ALL_SLOT_INDICES,
  GACHA_PHYSICS,
  GACHA_SLOT_X,
  GACHA_TOTAL_SLOTS,
  getMachineDocId,
  getMachineLabel,
  getRestingBoxPosition,
  normalizeMachineIndex,
  sanitizeBoxForClient,
} from '@/constants/gacha';
import { MEMBERS } from '@/constants/members';

export const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
export const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

export type GachaLogType =
  | 'start'
  | 'move'
  | 'win'
  | 'lock_expired'
  | 'auto_reset'
  | 'admin_reset'
  | 'admin_refill'
  | 'admin_ticket'
  | 'exchange'
  | 'exchange_sol';

export interface GachaLogInput {
  type: GachaLogType;
  member: string;
  message: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
}

/**
 * 모든 뽑기 최근 상황 및 주요 이벤트를 MongoDB `gacha_logs` 컬렉션에 영구 누적 저장
 */
export async function recordGachaLog(db: Db, entry: GachaLogInput): Promise<void> {
  try {
    const now = typeof entry.createdAt === 'number' ? entry.createdAt : Date.now();
    const kstTime = new Date(now + 9 * 3600 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);
    const id = `glog_${now}_${Math.random().toString(36).substring(2, 7)}`;
    await db.collection('gacha_logs').insertOne({
      _id: id as any,
      id,
      type: entry.type,
      member: entry.member || 'SYSTEM',
      message: entry.message,
      meta: entry.meta || {},
      kstTime,
      createdAt: now,
    });
  } catch (err) {
    console.warn('Failed to record gacha_logs entry:', err);
  }
}

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
 * KST 기준 정기 자동 재정렬·리필 스케줄(10:30, 14:00, 23:00) 중 가장 최근에 도래한 체크포인트 계산
 */
function getLatestScheduledCheckpoint(nowMs: number): {
  key: string;
  label: string;
  timestampMs: number;
} {
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const kstDate = new Date(nowMs + KST_OFFSET_MS);
  const y = kstDate.getUTCFullYear();
  const m = kstDate.getUTCMonth();
  const d = kstDate.getUTCDate();

  const makeKstMs = (year: number, month: number, day: number, hour: number, minute: number) =>
    Date.UTC(year, month, day, hour, minute, 0, 0) - KST_OFFSET_MS;

  const fmtDate = (ms: number) => {
    const dt = new Date(ms + KST_OFFSET_MS);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const candidates = [
    { label: '23:00', ts: makeKstMs(y, m, d - 1, 23, 0) },
    { label: '10:30', ts: makeKstMs(y, m, d, 10, 30) },
    { label: '14:00', ts: makeKstMs(y, m, d, 14, 0) },
    { label: '23:00', ts: makeKstMs(y, m, d, 23, 0) },
  ];

  let latest = candidates[0];
  for (const c of candidates) {
    if (c.ts <= nowMs) {
      latest = c;
    }
  }
  return {
    key: `${fmtDate(latest.ts)}_${latest.label}`,
    label: latest.label,
    timestampMs: latest.ts,
  };
}

/**
 * 개별 UFO 크레인 머신(machineIndex: 0..5, 1판 1상품) 상태 조회
 * (미생성 시 초기화, 만료된 락 자동 해제, 10:30/14:00/23:00 정기 자동 재정렬+리필)
 */
export async function getOrInitMachineState(db: Db, rawMachineIndex = 0): Promise<GachaMachineState> {
  const machineIndex = normalizeMachineIndex(rawMachineIndex, 0);
  const docId = getMachineDocId(machineIndex);
  const machineLabel = getMachineLabel(machineIndex);
  const col = db.collection('gacha_machine');
  const existing = (await col.findOne({ _id: docId as any })) as any;
  const now = Date.now();
  const latestCp = getLatestScheduledCheckpoint(now);

  if (!existing || !Array.isArray(existing.items)) {
    const initial: GachaMachineState = {
      id: docId,
      machineIndex,
      slotIndex: machineIndex,
      machineLabel,
      items: createSingleMachineItems(machineIndex, now),
      lock: {
        active: false,
        member: null,
        turnId: null,
        startedAt: null,
        expiresAt: null,
      },
      lastPlayedBy: null,
      lastPlayedAt: null,
      lastActionSummary: `[${machineIndex + 1}번 뽑기판] ${machineLabel} 준비 완료!`,
      resetCount: existing?.resetCount || 0,
      updatedAt: now,
    };

    await col.updateOne(
      { _id: docId as any },
      {
        $set: {
          ...initial,
          lastAutoResetSlot: latestCp.key,
          lastAutoResetAt: now,
        },
      },
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
    const expiredSummary = expiredMember
      ? `[${machineIndex + 1}번 뽑기판] ${expiredMember}님의 조작 시간이 만료되어 잠금이 해제되었습니다.`
      : existing.lastActionSummary;
    await col.updateOne(
      { _id: docId as any },
      {
        $set: {
          lock: clearedLock,
          lastActionSummary: expiredSummary,
          updatedAt: now,
        },
      }
    );
    if (expiredMember) {
      await recordGachaLog(db, {
        type: 'lock_expired',
        member: expiredMember,
        message: expiredSummary,
        meta: { turnId: existing.lock?.turnId || null, machineIndex, machineLabel },
        createdAt: now,
      });
    }
    existing.lock = clearedLock;
  }

  // 정기 자동 재정렬 및 리필 체크 (매일 KST 10:30, 14:00, 23:00)
  const isActivelyLocked = Boolean(
    existing.lock?.active && existing.lock?.expiresAt && existing.lock.expiresAt > now
  );
  const lastHandledMs = Number(existing.lastAutoResetAt) || Number(existing.updatedAt) || 0;
  if (
    !isActivelyLocked &&
    existing.lastAutoResetSlot !== latestCp.key &&
    latestCp.timestampMs > lastHandledMs
  ) {
    const freshBoxes = createSingleMachineItems(machineIndex, now);
    const autoSummary = `⏰ 정기 스케줄(${latestCp.label})로 [${machineIndex + 1}번 뽑기판] ${machineLabel}이(가) 자동 재정렬 및 리필되었습니다!`;

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };
    const autoUpdated = (await col.findOneAndUpdate(
      {
        _id: docId as any,
        lastAutoResetSlot: { $ne: latestCp.key },
        $or: [
          { 'lock.active': false },
          { 'lock.expiresAt': { $lt: now } },
          { 'lock.active': { $exists: false } },
        ],
      },
      {
        $set: {
          id: docId,
          machineIndex,
          slotIndex: machineIndex,
          machineLabel,
          items: freshBoxes,
          lock: clearedLock,
          lastActionSummary: autoSummary,
          lastAutoResetSlot: latestCp.key,
          lastAutoResetAt: now,
          updatedAt: now,
        },
        $inc: { resetCount: 1 },
      },
      { returnDocument: 'after' }
    )) as any;

    if (autoUpdated) {
      await recordGachaLog(db, {
        type: 'auto_reset',
        member: 'SYSTEM',
        message: autoSummary,
        meta: {
          machineIndex,
          machineLabel,
          scheduleSlot: latestCp.key,
          scheduleLabel: latestCp.label,
          remainingStock: freshBoxes.length,
        },
        createdAt: now,
      });
      return {
        id: docId,
        machineIndex,
        slotIndex: machineIndex,
        machineLabel,
        items: autoUpdated.items,
        lock: autoUpdated.lock || clearedLock,
        lastPlayedBy: autoUpdated.lastPlayedBy || null,
        lastPlayedAt: autoUpdated.lastPlayedAt || null,
        lastActionSummary: autoUpdated.lastActionSummary || autoSummary,
        resetCount: autoUpdated.resetCount || 0,
        updatedAt: autoUpdated.updatedAt || now,
      };
    }
  }

  return {
    id: docId,
    machineIndex,
    slotIndex: machineIndex,
    machineLabel,
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
 * 전체 6개 개별 UFO 뽑기판 상태 일괄 조회 (0..5)
 */
export async function getAllMachineStates(db: Db): Promise<GachaMachineState[]> {
  return Promise.all(GACHA_ALL_SLOT_INDICES.map((idx) => getOrInitMachineState(db, idx)));
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
    const freeIdx = GACHA_ALL_SLOT_INDICES.find((idx) => isSlotClear(idx));
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
