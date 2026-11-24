import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { GACHA_PHYSICS } from '@/constants/gacha';
import {
  getAllMemberTicketBalances,
  getOrInitMachineState,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const member = (body?.member || '').trim();

    if (!member || !MEMBERS.some((m) => m.name === member)) {
      return NextResponse.json(
        { success: false, message: '유효한 활동 멤버를 선택해주세요.' },
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

    // 1. 머신 상태 확인 및 만료된 락 정리
    const machine = await getOrInitMachineState(db);
    const now = Date.now();

    if (machine.lock.active && machine.lock.expiresAt && machine.lock.expiresAt > now) {
      return NextResponse.json(
        {
          success: false,
          lockedBy: machine.lock.member,
          message: `현재 ${machine.lock.member}님이 크레인을 조작 중입니다. 잠시만 기다려주세요!`,
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

    // 2. 뽑기권 1장 원자적 차감
    const ticketRes = await db.collection('gacha_tickets').findOneAndUpdate(
      { _id: member as any, tickets: { $gte: 1 } },
      {
        $inc: { tickets: -1, totalPlayed: 1 },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    );

    if (!ticketRes) {
      return NextResponse.json(
        {
          success: false,
          message: `${member}님의 보유 뽑기권이 없습니다. 식사 사진을 등록하면 뽑기권 5장이 지급됩니다!`,
        },
        { status: 400 }
      );
    }

    // 3. 원자적 머신 락 획득 (동시 시작 경합 시 티켓 복구)
    const turnId = `turn_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const newLock = {
      active: true,
      member,
      turnId,
      startedAt: now,
      expiresAt: now + GACHA_PHYSICS.LOCK_TTL_MS,
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
        { $inc: { tickets: 1, totalPlayed: -1 }, $set: { updatedAt: Date.now() } }
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

    return NextResponse.json({
      success: true,
      serverNow: Date.now(),
      turnId,
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
