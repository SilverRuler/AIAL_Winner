import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { getAllMemberTicketBalances, grantGachaTickets } from '@/lib/gachaServer';
import { getClientIp, normalizeIp } from '@/lib/ip';

/**
 * POST /api/gacha/exchange
 * 식사배틀 승점 1 WIN을 소모하여 UFO 뽑기권 5장으로 교환
 * - 식사배틀 총 WIN 수(meals.isWinner)는 그대로 유지
 * - 대신 gacha_win_exchanges에 1회 차감 기록되어 식사배틀 리워드 신청 가능 WIN에서 -1 차감됨 (음수 표시 허용)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
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

    const [actualWins, existingApps, existingExchanges] = await Promise.all([
      db.collection('meals').countDocuments({ member, isWinner: true }),
      db
        .collection('reward_applications')
        .find({ member, status: { $ne: 'rejected' } })
        .toArray(),
      db.collection('gacha_win_exchanges').find({ member }).toArray(),
    ]);

    const rewardUsedWins = existingApps.reduce(
      (sum: number, app: any) => sum + (Number(app.requestedWins) || 0),
      0
    );
    const exchangedWins = existingExchanges.reduce(
      (sum: number, ex: any) => sum + (Number(ex.winsUsed) || 1),
      0
    );

    if (actualWins - exchangedWins < 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            actualWins === 0
              ? `${member}님은 식사배틀 보유 승점(WIN)이 없어 교환할 수 없습니다.`
              : `${member}님의 총 승점(${actualWins}WIN)을 이미 모두 교환하여 추가 교환할 수 없습니다.`,
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

    const nextExchangedWins = exchangedWins + 1;
    const availableMealWinsAfter = actualWins - rewardUsedWins - nextExchangedWins;

    await db.collection('gacha_win_exchanges').insertOne({
      id: `gex_${now}_${Math.random().toString(36).substring(2, 7)}`,
      member,
      winsUsed: 1,
      ticketsGranted: 5,
      actualWinsAtExchange: actualWins,
      availableMealWinsAfter,
      ip: clientIp,
      createdAt: now,
      date: kstDate,
    });

    const newTicketBalance = await grantGachaTickets(db, member, 5);
    const ticketsByMember = await getAllMemberTicketBalances(db);

    return NextResponse.json({
      success: true,
      message: `🎟️ ${member}님의 승점 1WIN을 뽑기권 5장으로 교환했습니다! (현재 뽑기권 ${newTicketBalance}장 · 식사배틀 남은 신청 가능 WIN: ${availableMealWinsAfter})`,
      ticketsByMember,
      exchangedWins: nextExchangedWins,
      availableMealWins: availableMealWinsAfter,
    });
  } catch (error: any) {
    console.error('Failed to exchange meal win for gacha tickets:', error);
    return NextResponse.json(
      { success: false, message: '승점 교환 처리 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
