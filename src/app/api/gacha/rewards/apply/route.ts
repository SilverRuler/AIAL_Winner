import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getTelegramConfig } from '@/lib/gachaServer';
import { GACHA_DEFAULT_REWARD_AMOUNT } from '@/constants/gacha';
import { getClientIp, normalizeIp } from '@/lib/ip';

function roundSol(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * GET /api/gacha/rewards/apply
 * UFO 뽑기 전용 리워드 신청 내역 및 멤버별 총 획득 SOL / 기신청 SOL / 신청 가능 SOL / 풀이 완료 퀴즈 조회
 * (식사배틀 reward_applications와 완전히 별도의 gacha_reward_applications 컬렉션 사용)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const member = searchParams.get('member');

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'Database connection failed' },
        { status: 500 }
      );
    }

    const query: any = {};
    if (member && member !== 'all') {
      query.member = member;
    }

    const [applications, allValidApps, allWins, allSolExchanges] = await Promise.all([
      db
        .collection('gacha_reward_applications')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray(),
      db
        .collection('gacha_reward_applications')
        .find({ status: { $ne: 'rejected' } })
        .toArray(),
      db
        .collection('gacha_wins')
        .find({})
        .sort({ createdAt: 1 })
        .toArray(),
      db
        .collection('gacha_sol_exchanges')
        .find({}, { projection: { member: 1, solUsed: 1 } })
        .toArray(),
    ]);

    const memberActualWins: Record<string, number> = {};
    const memberTotalSol: Record<string, number> = {};
    for (const w of allWins as any[]) {
      if (w.member) {
        memberActualWins[w.member] = (memberActualWins[w.member] || 0) + 1;
        const amt =
          typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT;
        memberTotalSol[w.member] = roundSol((memberTotalSol[w.member] || 0) + amt);
      }
    }

    const memberUsedWins: Record<string, number> = {};
    const memberUsedSol: Record<string, number> = {};
    const memberSolvedQuizIds: Record<string, string[]> = {};

    for (const app of allValidApps as any[]) {
      if (!app.member) continue;
      memberUsedWins[app.member] =
        (memberUsedWins[app.member] || 0) + (Number(app.requestedWins) || 0);
      const appSol =
        typeof app.rewardAmount === 'number'
          ? app.rewardAmount
          : roundSol((Number(app.requestedWins) || 0) * GACHA_DEFAULT_REWARD_AMOUNT);
      memberUsedSol[app.member] = roundSol((memberUsedSol[app.member] || 0) + appSol);

      if (Array.isArray(app.solvedQuizIds)) {
        if (!memberSolvedQuizIds[app.member]) {
          memberSolvedQuizIds[app.member] = [];
        }
        for (const qId of app.solvedQuizIds) {
          if (qId && !memberSolvedQuizIds[app.member].includes(qId)) {
            memberSolvedQuizIds[app.member].push(qId);
          }
        }
      }
    }

    const memberExchangedSol: Record<string, number> = {};
    for (const ex of allSolExchanges as any[]) {
      if (!ex.member) continue;
      const s = Number(ex.solUsed) || 0;
      memberExchangedSol[ex.member] = roundSol((memberExchangedSol[ex.member] || 0) + s);
      memberUsedSol[ex.member] = roundSol((memberUsedSol[ex.member] || 0) + s);
    }

    const memberAvailableSol: Record<string, number> = {};
    const allMembers = new Set([
      ...Object.keys(memberTotalSol),
      ...Object.keys(memberUsedSol),
    ]);
    for (const mem of allMembers) {
      memberAvailableSol[mem] = Math.max(
        0,
        roundSol((memberTotalSol[mem] || 0) - (memberUsedSol[mem] || 0))
      );
    }

    return NextResponse.json({
      success: true,
      applications: applications.map((app: any) => ({
        id: app.id || app._id.toString(),
        member: app.member,
        totalWins: app.totalWins || 0,
        requestedWins: app.requestedWins || 0,
        rewardAmount:
          typeof app.rewardAmount === 'number'
            ? app.rewardAmount
            : roundSol((app.requestedWins || 1) * GACHA_DEFAULT_REWARD_AMOUNT),
        walletAddress: app.walletAddress || '',
        memo: app.memo || '',
        status: app.status || 'pending',
        solvedQuizIds: app.solvedQuizIds || [],
        createdAt: app.createdAt || Date.now(),
        date: app.date || '',
        // ip 필드는 MongoDB 내부 기록 전용으로 클라이언트에 노출하지 않음
      })),
      memberActualWins,
      memberUsedWins,
      memberTotalSol,
      memberUsedSol,
      memberExchangedSol,
      memberAvailableSol,
      memberSolvedQuizIds,
    });
  } catch (err: any) {
    console.error('Failed to fetch gacha reward applications:', err);
    return NextResponse.json(
      { success: false, message: err.message || '조회 실패' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gacha/rewards/apply
 * UFO 뽑기 리워드 신청 (유저가 원하는 SOL 수량을 직접 입력, 퀴즈 통과 후 제출, 접속 IP MongoDB 기록)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member, requestedSol, requestedWins, walletAddress, memo, solvedQuizIds } = body || {};

    const trimmedMember = (member || '').trim();
    const trimmedWallet = (walletAddress || '').trim();

    // 신규 SOL 직접 입력 우선, 레거시 requestedWins fallback 지원
    const rawSol =
      requestedSol !== undefined && requestedSol !== null && requestedSol !== ''
        ? Number(requestedSol)
        : Number(requestedWins) * GACHA_DEFAULT_REWARD_AMOUNT;
    const parsedSol = roundSol(rawSol);

    if (!trimmedMember) {
      return NextResponse.json(
        { success: false, message: '신청 멤버를 지정해주세요.' },
        { status: 400 }
      );
    }

    if (!trimmedWallet) {
      return NextResponse.json(
        { success: false, message: '리워드를 수령할 솔라나(SOL) 지갑 주소를 필수로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(rawSol) || parsedSol <= 0) {
      return NextResponse.json(
        { success: false, message: '신청할 SOL 수량을 0보다 큰 숫자로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (parsedSol < 0.001) {
      return NextResponse.json(
        { success: false, message: '최소 0.001 SOL 이상부터 신청 가능합니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'Database connection failed' },
        { status: 500 }
      );
    }

    // 1. 해당 멤버의 실제 UFO 뽑기 누적 획득 SOL 집계 (gacha_wins)
    const memberWins = await db
      .collection('gacha_wins')
      .find({ member: trimmedMember })
      .toArray();
    const actualWins = memberWins.length;
    const totalEarnedSol = roundSol(
      memberWins.reduce(
        (sum: number, w: any) =>
          sum + (typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT),
        0
      )
    );

    // 2. 기존 UFO 뽑기 리워드 기신청 + 뽑기권 교환 차감 SOL 집계 (rejected 제외)
    const [existingApps, existingSolExchanges] = await Promise.all([
      db
        .collection('gacha_reward_applications')
        .find({ member: trimmedMember, status: { $ne: 'rejected' } })
        .toArray(),
      db
        .collection('gacha_sol_exchanges')
        .find({ member: trimmedMember })
        .toArray(),
    ]);

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
    const usedSol = roundSol(usedAppliedSol + usedExchangedSol);

    const availableSol = Math.max(0, roundSol(totalEarnedSol - usedSol));

    if (availableSol <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: `남은 신청 가능 SOL이 없습니다. (총 ${totalEarnedSol} SOL 획득 중 ${usedSol} SOL 기신청)`,
        },
        { status: 400 }
      );
    }

    if (parsedSol > availableSol + 1e-9) {
      return NextResponse.json(
        {
          success: false,
          message: `신청 금액(${parsedSol} SOL)이 남은 신청 가능 금액(${availableSol} SOL)을 초과했습니다.`,
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
    const remainingSolAfter = Math.max(0, roundSol(availableSol - parsedSol));

    const newApplication = {
      id: `gapp_${now}_${Math.random().toString(36).substring(2, 8)}`,
      member: trimmedMember,
      totalWins: actualWins,
      totalSol: totalEarnedSol,
      requestedWins: 0,
      requestedSol: parsedSol,
      rewardAmount: parsedSol,
      walletAddress: trimmedWallet,
      memo: (memo || '').trim(),
      status: 'pending',
      notified: false,
      solvedQuizIds: Array.isArray(solvedQuizIds) ? solvedQuizIds : [],
      createdAt: now,
      date: kstDate,
    };

    // MongoDB 내부에 신청자 접속 IP 함께 기록
    await db.collection('gacha_reward_applications').insertOne({
      ...newApplication,
      ip: clientIp,
    } as any);

    const cleanMemo = newApplication.memo || '없음';

    const telegramText =
      `🎰 <b>[AIAL Winner] UFO 뽑기 리워드 신청 접수!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>신청 멤버:</b> <b>${trimmedMember}</b>\n` +
      `🏆 <b>총 누적 획득:</b> ${totalEarnedSol} SOL (${actualWins}개)\n` +
      `🎯 <b>이번 신청 금액:</b> <b>${parsedSol} SOL</b>\n` +
      `📉 <b>남은 신청 가능:</b> <b>${remainingSolAfter} SOL</b> (신청 전 ${availableSol} SOL)\n` +
      `💳 <b>지갑 주소 (SOL):</b> <code>${trimmedWallet}</code>\n` +
      `📝 <b>신청자 메모:</b> ${cleanMemo}\n` +
      `⏰ <b>신청 일시:</b> ${kstDate} (KST)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>관리자님, SOL 전송 후 뽑기 명예의 전당 → 리워드 현황에 영수증을 등록해주세요!</i>`;

    const { token: teleToken, chatId: teleChatId } = getTelegramConfig();
    try {
      const teleResp = await fetch(
        `https://api.telegram.org/bot${teleToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: teleChatId,
            text: telegramText,
            parse_mode: 'HTML',
          }),
        }
      );
      if (teleResp.ok) {
        await db.collection('gacha_reward_applications').updateOne(
          { id: newApplication.id },
          { $set: { notified: true, notifiedAt: Date.now() } }
        );
      } else {
        console.warn('Telegram gacha reward apply send failed:', await teleResp.text());
      }
    } catch (teleErr) {
      console.error('Failed to send telegram alert for gacha reward application:', teleErr);
    }

    return NextResponse.json({
      success: true,
      message: `${trimmedMember}님의 UFO 뽑기 ${parsedSol} SOL 리워드 신청이 접수되었습니다!`,
      application: newApplication,
      remainingAvailableSol: remainingSolAfter,
    });
  } catch (err: any) {
    console.error('Failed to process gacha reward application:', err);
    return NextResponse.json(
      { success: false, message: err.message || '신청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
