import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { GACHA_DEFAULT_REWARD_AMOUNT } from '@/constants/gacha';
import {
  getAllMemberTicketBalances,
  getGachaMachineOps,
  grantGachaTickets,
  recordGachaLog,
} from '@/lib/gachaServer';
import { getClientIp, normalizeIp } from '@/lib/ip';

function roundSol(val: number): number {
  return Math.round(val * 10000) / 10000;
}

const SOL_PER_TICKET = 0.001;

/**
 * POST /api/gacha/exchange-sol
 * 획득한 UFO 뽑기 리워드 0.001 SOL당 뽑기권 1장으로 교환 (한 번에 원하는 수량 교환 가능)
 * - 신청 가능 뽑기 리워드 잔고(누적 획득 SOL - 기신청 SOL - 기교환 SOL)가 0.001 SOL 이상일 때만 교환 허용
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const member = (body?.member || '').trim();
    const rawCount = body?.ticketCount !== undefined ? Number(body.ticketCount) : 1;
    const ticketCount = Math.floor(rawCount);

    if (!member || !MEMBERS.some((m) => m.name === member)) {
      return NextResponse.json(
        { success: false, message: '유효한 활동 멤버를 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > 1000) {
      return NextResponse.json(
        { success: false, message: '교환할 뽑기권 수량은 1장 이상 1,000장 이하의 정수로 입력해주세요.' },
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

    const machineOps = await getGachaMachineOps(db);
    if (machineOps.suspended) {
      return NextResponse.json(
        {
          success: false,
          suspended: true,
          message: '현재 전 기기 운영 중단(점검중) 상태라 리워드 뽑기권 교환을 이용할 수 없습니다.',
        },
        { status: 503 }
      );
    }

    const [memberWins, existingApps, existingSolExchanges] = await Promise.all([
      db.collection('gacha_wins').find({ member }).toArray(),
      db
        .collection('gacha_reward_applications')
        .find({ member, status: { $ne: 'rejected' } })
        .toArray(),
      db.collection('gacha_sol_exchanges').find({ member }).toArray(),
    ]);

    const totalEarnedSol = roundSol(
      memberWins.reduce(
        (sum: number, w: any) =>
          sum + (typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT),
        0
      )
    );
    const usedAppliedSol = roundSol(
      existingApps.reduce(
        (sum: number, app: any) =>
          sum +
          (typeof app.rewardAmount === 'number'
            ? app.rewardAmount
            : roundSol((Number(app.requestedWins) || 0) * GACHA_DEFAULT_REWARD_AMOUNT)),
        0
      )
    );
    const usedExchangedSol = roundSol(
      existingSolExchanges.reduce(
        (sum: number, ex: any) => sum + (Number(ex.solUsed) || 0),
        0
      )
    );

    const availableSolBefore = Math.max(
      0,
      roundSol(totalEarnedSol - usedAppliedSol - usedExchangedSol)
    );
    const solNeeded = roundSol(ticketCount * SOL_PER_TICKET);

    if (availableSolBefore + 1e-9 < solNeeded) {
      return NextResponse.json(
        {
          success: false,
          message: `${member}님의 신청 가능 뽑기 리워드(${availableSolBefore} SOL)가 부족합니다. (0.001 SOL당 뽑기권 1장 교환 가능)`,
        },
        { status: 400 }
      );
    }

    const now = Date.now();
    const kstDate = new Date(now + 9 * 3600 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);
    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || rawIp || '';

    const availableSolAfter = Math.max(0, roundSol(availableSolBefore - solNeeded));
    const exchangeLockId = `${member}_solex_${existingSolExchanges.length + 1}`;

    try {
      await db.collection('gacha_sol_exchanges').insertOne({
        _id: exchangeLockId as any,
        id: `gsolex_${now}_${Math.random().toString(36).substring(2, 7)}`,
        member,
        solUsed: solNeeded,
        ticketsGranted: ticketCount,
        totalEarnedSolAtExchange: totalEarnedSol,
        availableSolAfter,
        ip: clientIp,
        createdAt: now,
        date: kstDate,
      });
    } catch (insertErr: any) {
      if (insertErr?.code === 11000) {
        return NextResponse.json(
          {
            success: false,
            message: '이미 처리 중인 리워드 교환 요청입니다. 잠시 후 상태를 확인해주세요.',
          },
          { status: 409 }
        );
      }
      throw insertErr;
    }

    const newTicketBalance = await grantGachaTickets(db, member, ticketCount);
    const ticketsByMember = await getAllMemberTicketBalances(db);
    const message = `🪙 ${member}님의 뽑기 리워드 ${solNeeded} SOL을 뽑기권 ${ticketCount}장으로 교환했습니다! (현재 뽑기권 ${newTicketBalance}장 · 남은 뽑기 리워드: ${availableSolAfter} SOL)`;

    await recordGachaLog(db, {
      type: 'exchange_sol',
      member,
      message,
      meta: {
        solUsed: solNeeded,
        ticketsGranted: ticketCount,
        newTicketBalance,
        availableSolAfter,
        ip: clientIp,
      },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message,
      ticketsByMember,
      availableGachaSol: availableSolAfter,
    });
  } catch (error: any) {
    console.error('Failed to exchange gacha SOL for tickets:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 리워드 교환 처리 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
