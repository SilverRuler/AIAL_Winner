import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { GACHA_PHYSICS, getMachineDocId, getMachineLabel, normalizeMachineIndex } from '@/constants/gacha';
import {
  getAllMemberTicketBalances,
  getGachaMachineOps,
  getNextScheduledResetInfo,
  getOrInitMachineState,
  recordGachaLog,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';
import { getClientIp, normalizeIp } from '@/lib/ip';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const member = (body?.member || '').trim();
    const rawPlayCount = body?.playCount !== undefined ? Number(body.playCount) : 1;
    const machineIndex = normalizeMachineIndex(body?.machineIndex, 0);
    const docId = getMachineDocId(machineIndex);
    const machineLabel = getMachineLabel(machineIndex);

    if (!member || !MEMBERS.some((m) => m.name === member)) {
      return NextResponse.json(
        { success: false, message: '유효한 활동 멤버를 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(rawPlayCount) || rawPlayCount < 1 || rawPlayCount > 100) {
      return NextResponse.json(
        { success: false, message: '올바른 뽑기 횟수(1회 이상 정수)를 입력해주세요.' },
        { status: 400 }
      );
    }

    const playCount = rawPlayCount;
    // 연속 5가챠당 1회 무료 보너스 지급 (예: 5장 사용 -> 총 6회 연속)
    const bonusPlays = Math.floor(playCount / 5);
    const totalPlays = playCount + bonusPlays;

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    // 0. 전 기기 운영 중단(점검중) 및 정기 리셋 5초 전 락다운 검증
    const [machineOps, machine] = await Promise.all([
      getGachaMachineOps(db),
      getOrInitMachineState(db, machineIndex),
    ]);
    const now = Date.now();

    if (machineOps.suspended) {
      return NextResponse.json(
        {
          success: false,
          suspended: true,
          serverNow: now,
          message: '현재 전 기기 운영 중단(점검중) 상태입니다. 운영 재개 후 다시 이용해주세요!',
        },
        { status: 503 }
      );
    }

    if ((machineOps.suspendedMachines || []).includes(machineIndex)) {
      return NextResponse.json(
        {
          success: false,
          suspended: true,
          serverNow: now,
          message: `[${machineIndex + 1}번 뽑기판] ${machineLabel}은(는) 현재 운영 중단(점검중) 상태입니다. 다른 뽑기판을 이용해주세요!`,
        },
        { status: 503 }
      );
    }

    const nextReset = getNextScheduledResetInfo(now);
    if (nextReset.secondsUntilReset > 0 && nextReset.secondsUntilReset <= 5) {
      const remain = Math.max(1, Math.ceil(nextReset.secondsUntilReset));
      return NextResponse.json(
        {
          success: false,
          resetLockdown: true,
          serverNow: now,
          message: `${remain}초 뒤에 정기 뽑기 리셋(${nextReset.nextResetLabel})이 진행되어 잠시 잠금 상태입니다. 리셋 직후 다시 시도해주세요!`,
        },
        { status: 423 }
      );
    }

    if (machine.lock.active && machine.lock.expiresAt && machine.lock.expiresAt > now) {
      return NextResponse.json(
        {
          success: false,
          lockedBy: machine.lock.member,
          serverNow: now,
          message: `현재 ${machine.lock.member}님이 [${machineIndex + 1}번 뽑기판] 크레인을 조작 중입니다. 다른 뽑기판을 이용하거나 잠시만 기다려주세요!`,
        },
        { status: 409 }
      );
    }

    if (!Array.isArray(machine.items) || machine.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `[${machineIndex + 1}번 뽑기판] ${machineLabel}은(는) 현재 품절 상태입니다. 다른 뽑기판으로 이동하거나 리필을 기다려주세요!`,
        },
        { status: 400 }
      );
    }

    // 2. 뽑기권 playCount장 원자적 차감 (보유 수량 초과 요청 원천 차단)
    const ticketRes = await db.collection('gacha_tickets').findOneAndUpdate(
      { _id: member as any, tickets: { $gte: playCount } },
      {
        $inc: { tickets: -playCount },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    );

    if (!ticketRes) {
      const currentDoc = (await db
        .collection('gacha_tickets')
        .findOne({ _id: member as any })) as any;
      const curTickets = Math.max(0, Number(currentDoc?.tickets) || 0);
      return NextResponse.json(
        {
          success: false,
          message:
            curTickets === 0
              ? `${member}님의 보유 뽑기권이 없습니다. 식사 사진을 등록하면 뽑기권 5장이 지급됩니다!`
              : `${member}님의 보유 뽑기권(${curTickets}장)보다 많은 ${playCount}회는 진행할 수 없습니다.`,
        },
        { status: 400 }
      );
    }

    // 3. 원자적 머신 락 획득 (동시 시작 경합 시 차감한 티켓 전액 롤백)
    const turnId = `turn_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const newLock = {
      active: true,
      member,
      turnId,
      startedAt: now,
      expiresAt: now + GACHA_PHYSICS.LOCK_TTL_MS,
      totalPlays,
      remainingPlays: totalPlays,
      shotIndex: 1,
      paidTickets: playCount,
      bonusPlays,
    };

    const lockRes = await db.collection('gacha_machine').findOneAndUpdate(
      {
        _id: docId as any,
        $or: [
          { 'lock.active': false },
          { 'lock.expiresAt': { $lt: now } },
          { 'lock.active': { $exists: false } },
        ],
      },
      {
        $set: {
          lock: newLock,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!lockRes) {
      // 동시 클릭으로 락 획득 실패 시 차감했던 티켓 롤백
      await db.collection('gacha_tickets').updateOne(
        { _id: member as any },
        { $inc: { tickets: playCount }, $set: { updatedAt: Date.now() } }
      );
      const latestMachine = (await db
        .collection('gacha_machine')
        .findOne({ _id: docId as any })) as any;
      const currentOwner = latestMachine?.lock?.member || '다른 멤버';
      return NextResponse.json(
        {
          success: false,
          lockedBy: currentOwner,
          serverNow: Date.now(),
          message: `현재 ${currentOwner}님이 [${machineIndex + 1}번 뽑기판]을 진행 중입니다. 잠시만 기다려주세요!`,
        },
        { status: 409 }
      );
    }

    const ticketsByMember = await getAllMemberTicketBalances(db);

    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || rawIp || '';
    const startMsg =
      bonusPlays > 0
        ? `🔥 [${machineIndex + 1}번 ${machineLabel}] ${member}님이 연속 ${playCount}가챠 시작! (+${bonusPlays}회 보너스 → 총 ${totalPlays}회)`
        : totalPlays > 1
        ? `🕹️ [${machineIndex + 1}번 ${machineLabel}] ${member}님이 ${totalPlays}회 연속 뽑기를 시작했습니다.`
        : `🕹️ [${machineIndex + 1}번 ${machineLabel}] ${member}님이 뽑기 1회를 시작했습니다.`;

    await recordGachaLog(db, {
      type: 'start',
      member,
      message: startMsg,
      meta: {
        turnId,
        machineIndex,
        machineLabel,
        playCount,
        bonusPlays,
        totalPlays,
        remainingStock: machine.items.length,
        ip: clientIp,
      },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      serverNow: Date.now(),
      machineIndex,
      turnId,
      shotIndex: 1,
      totalPlays,
      remainingPlays: totalPlays,
      paidTickets: playCount,
      bonusPlays,
      expiresAt: newLock.expiresAt,
      machine: sanitizeMachineForClient(lockRes as any),
      ticketsByMember,
    });
  } catch (error: any) {
    console.error('Failed to start gacha turn:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 시작 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
