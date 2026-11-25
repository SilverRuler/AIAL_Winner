import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getTelegramConfig } from '@/lib/gachaServer';
import { GACHA_DEFAULT_REWARD_AMOUNT } from '@/constants/gacha';
import { getClientIp, normalizeIp } from '@/lib/ip';

/**
 * GET /api/gacha/rewards/apply
 * UFO 뽑기 전용 리워드 신청 내역 및 멤버별 기신청 차감 개수/풀이 완료 퀴즈 조회
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

    const [applications, allValidApps, allWins] = await Promise.all([
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
    ]);

    const memberActualWins: Record<string, number> = {};
    const memberWinsAsc: Record<string, number[]> = {};
    for (const w of allWins as any[]) {
      if (w.member) {
        memberActualWins[w.member] = (memberActualWins[w.member] || 0) + 1;
        if (!memberWinsAsc[w.member]) memberWinsAsc[w.member] = [];
        memberWinsAsc[w.member].push(
          typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT
        );
      }
    }

    const memberUsedWins: Record<string, number> = {};
    const memberSolvedQuizIds: Record<string, string[]> = {};

    for (const app of allValidApps as any[]) {
      memberUsedWins[app.member] =
        (memberUsedWins[app.member] || 0) + (app.requestedWins || 0);

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

    // 멤버별 미신청(남은) 당첨 상자별 실제 SOL 금액 목록 (FIFO)
    const memberUnclaimedWinAmounts: Record<string, number[]> = {};
    for (const [mem, list] of Object.entries(memberWinsAsc)) {
      const used = memberUsedWins[mem] || 0;
      memberUnclaimedWinAmounts[mem] = list.slice(used);
    }

    return NextResponse.json({
      success: true,
      applications: applications.map((app: any) => ({
        id: app.id || app._id.toString(),
        member: app.member,
        totalWins: app.totalWins || 0,
        requestedWins: app.requestedWins || 1,
        rewardAmount:
          typeof app.rewardAmount === 'number'
            ? app.rewardAmount
            : Number(((app.requestedWins || 1) * GACHA_DEFAULT_REWARD_AMOUNT).toFixed(4)),
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
      memberUnclaimedWinAmounts,
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
 * UFO 뽑기 리워드 신청 (1개 단위 선택, 퀴즈 통과 후 제출, 접속 IP MongoDB 기록)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member, requestedWins, walletAddress, memo, solvedQuizIds } = body || {};

    const trimmedMember = (member || '').trim();
    const parsedCount = Math.floor(Number(requestedWins));
    const trimmedWallet = (walletAddress || '').trim();

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

    if (!parsedCount || isNaN(parsedCount) || parsedCount < 1) {
      return NextResponse.json(
        { success: false, message: '리워드 신청은 최소 1개 이상, 1개 단위로 신청 가능합니다.' },
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

    // 1. 해당 멤버의 실제 UFO 뽑기 성공 전체 내역 (생성순 FIFO) 조회 (gacha_wins)
    const memberWinsAsc = await db
      .collection('gacha_wins')
      .find({ member: trimmedMember })
      .sort({ createdAt: 1 })
      .toArray();
    const actualWins = memberWinsAsc.length;

    // 2. 기존 UFO 뽑기 리워드 기신청 차감 개수 집계 (gacha_reward_applications, rejected 제외)
    const existingApps = await db
      .collection('gacha_reward_applications')
      .find({ member: trimmedMember, status: { $ne: 'rejected' } })
      .toArray();

    const usedWins = existingApps.reduce(
      (sum: number, app: any) => sum + (app.requestedWins || 0),
      0
    );

    const availableWins = Math.max(0, actualWins - usedWins);

    if (availableWins < 1) {
      return NextResponse.json(
        {
          success: false,
          message: `남은 신청 가능 뽑기 개수가 없습니다. (총 ${actualWins}개 획득 중 ${usedWins}개 기신청)`,
        },
        { status: 400 }
      );
    }

    if (parsedCount > availableWins) {
      return NextResponse.json(
        {
          success: false,
          message: `신청 개수(${parsedCount}개)가 남은 신청 가능 개수(${availableWins}개)를 초과했습니다.`,
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
    // FIFO 순서로 이번 신청에 해당하는 당첨 상자들의 실제 SOL 합계 산출
    const selectedWins = memberWinsAsc.slice(usedWins, usedWins + parsedCount);
    const rewardSol = Number(
      selectedWins
        .reduce(
          (sum: number, w: any) =>
            sum + (typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT),
          0
        )
        .toFixed(4)
    );
    const selectedBoxesText = selectedWins
      .map((w: any) => `${w.boxLabel || '박스'}(${typeof w.rewardAmount === 'number' ? w.rewardAmount : GACHA_DEFAULT_REWARD_AMOUNT} SOL)`)
      .join(', ');

    const newApplication = {
      id: `gapp_${now}_${Math.random().toString(36).substring(2, 8)}`,
      member: trimmedMember,
      totalWins: actualWins,
      requestedWins: parsedCount,
      rewardAmount: rewardSol,
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

    const remainingAfterThis = availableWins - parsedCount;
    const cleanMemo = newApplication.memo || '없음';

    const telegramText =
      `🎰 <b>[AIAL Winner] UFO 뽑기 리워드 신청 접수!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>신청 멤버:</b> <b>${trimmedMember}</b>\n` +
      `🏆 <b>총 뽑기 성공:</b> ${actualWins}개\n` +
      `🎯 <b>이번 신청 수량:</b> <b>${parsedCount}개 (${rewardSol} SOL)</b>\n` +
      (selectedBoxesText ? `📦 <b>신청 내역:</b> ${selectedBoxesText}\n` : '') +
      `📉 <b>남은 신청 가능:</b> <b>${remainingAfterThis}개</b> (신청 전 ${availableWins}개)\n` +
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
      message: `${trimmedMember}님의 UFO 뽑기 ${parsedCount}개(${rewardSol} SOL) 리워드 신청이 접수되었습니다!`,
      application: newApplication,
      remainingAvailableWins: remainingAfterThis,
    });
  } catch (err: any) {
    console.error('Failed to process gacha reward application:', err);
    return NextResponse.json(
      { success: false, message: err.message || '신청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
