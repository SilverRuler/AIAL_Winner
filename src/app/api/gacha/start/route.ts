import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { GACHA_PHYSICS } from '@/constants/gacha';
import {
  getAllMemberTicketBalances,
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

    // 1. 머신 상태 확인 및 만료된 락 정리
    const machine = await getOrInitMachineState(db);
    const now = Date.now();

    if (machine.lock.active && machine.lock.expiresAt && machine.lock.expiresAt > now) {
      return NextResponse.json(
        {
          success: false,
          lockedBy: machine.lock.member,
          serverNow: now,
          message: `현재 ${machine.lock.member}님이 크레인을 조작 중입니다. 완료될 때까지 잠시만 기다려주세요!`,
        },
        { status: 409 }
      );
    }

    if (!Array.isArray(machine.items) || machine.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: '현재 남은 상품이 없습니다. 운영자가 뽑기판을 리필할 때까지 기다려주세요!',
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
        _id: 'main_ufo_bridge' as any,
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
        .findOne({ _id: 'main_ufo_bridge' as any })) as any;
      const currentOwner = latestMachine?.lock?.member || '다른 멤버';
      return NextResponse.json(
        {
          success: false,
          lockedBy: currentOwner,
          serverNow: Date.now(),
          message: `현재 ${currentOwner}님이 뽑기를 진행 중입니다. 완료될 때까지 잠시만 기다려주세요!`,
        },
        { status: 409 }
      );
    }

    const ticketsByMember = await getAllMemberTicketBalances(db);

    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || rawIp || '';
    const startMsg =
      bonusPlays > 0
        ? `🔥 ${member}님이 연속 ${playCount}가챠를 시작했습니다! (+${bonusPlays}회 보너스 → 총 ${totalPlays}회)`
        : totalPlays > 1
        ? `🕹️ ${member}님이 ${totalPlays}회 연속 뽑기를 시작했습니다.`
        : `🕹️ ${member}님이 뽑기 1회를 시작했습니다.`;

    await recordGachaLog(db, {
      type: 'start',
      member,
      message: startMsg,
      meta: {
        turnId,
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
