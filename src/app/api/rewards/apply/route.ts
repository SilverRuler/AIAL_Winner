import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { RewardApplication } from '@/types/meal';

function getTelegramConfig() {
  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    Buffer.from('ODc3ODI4MjAwMTpBQUdwNUZUVi10akFKY21lS3V2aGRtRDhESkNQMl9haV8tYw==', 'base64').toString('utf-8');
  const chatId =
    process.env.TELEGRAM_CHAT_ID ||
    Buffer.from('MTc3Nzk1MjQ1Nw==', 'base64').toString('utf-8');
  return { token, chatId };
}

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

    const applications = await db
      .collection('reward_applications')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // 전체 멤버별 기신청 차감 승수 집계 (반려 rejected 건 제외)
    const allValidApps = await db
      .collection('reward_applications')
      .find({ status: { $ne: 'rejected' } })
      .toArray();

    const memberUsedWins: Record<string, number> = {};
    for (const app of allValidApps) {
      memberUsedWins[app.member] =
        (memberUsedWins[app.member] || 0) + (app.requestedWins || 0);
    }

    return NextResponse.json({
      success: true,
      applications: applications.map((app: any) => ({
        id: app.id || app._id.toString(),
        member: app.member,
        totalWins: app.totalWins || 0,
        requestedWins: app.requestedWins || 5,
        walletAddress: app.walletAddress || '',
        memo: app.memo || '',
        status: app.status || 'pending',
        createdAt: app.createdAt || Date.now(),
        date: app.date || '',
      })),
      memberUsedWins,
    });
  } catch (err: any) {
    console.error('Failed to fetch reward applications:', err);
    return NextResponse.json(
      { success: false, message: err.message || '조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member, requestedWins, walletAddress, memo } = body;

    const trimmedMember = (member || '').trim();
    const parsedWins = Number(requestedWins);
    const trimmedWallet = (walletAddress || '').trim();

    if (!trimmedMember) {
      return NextResponse.json(
        { success: false, message: '신청 멤버를 지정해주세요.' },
        { status: 400 }
      );
    }

    // 솔라나(SOL) 지갑 주소 필수 검증
    if (!trimmedWallet) {
      return NextResponse.json(
        { success: false, message: '리워드를 수령할 솔라나(SOL) 지갑 주소를 필수로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 5의 배수 검증
    if (!parsedWins || isNaN(parsedWins) || parsedWins < 5 || parsedWins % 5 !== 0) {
      return NextResponse.json(
        { success: false, message: '리워드 신청은 최소 5WIN 이상, 5WIN 단위로만 가능합니다.' },
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

    // 1. 해당 유저의 실제 총 WIN 수 집계
    const winMeals = await db
      .collection('meals')
      .find({ member: trimmedMember, isWinner: true })
      .toArray();

    const actualWins = winMeals.length;

    // 2. 해당 유저의 기존 리워드 신청 차감 승수(usedWins) 집계 (rejected 제외)
    const existingApps = await db
      .collection('reward_applications')
      .find({ member: trimmedMember, status: { $ne: 'rejected' } })
      .toArray();

    const usedWins = existingApps.reduce(
      (sum: number, app: any) => sum + (app.requestedWins || 0),
      0
    );

    // 3. 남은 신청 가능 승수(availableWins) 계산 (자신의 승수는 유지되지만 신청 가능 수만 차감)
    const availableWins = Math.max(0, actualWins - usedWins);
    const maxAllowedWins = Math.floor(availableWins / 5) * 5;

    if (availableWins < 5) {
      return NextResponse.json(
        {
          success: false,
          message: `남은 신청 가능 승수(${availableWins}WIN)가 최소 요구치(5WIN)에 미달합니다. (총 ${actualWins}WIN 중 ${usedWins}WIN 기신청)`,
        },
        { status: 400 }
      );
    }

    if (parsedWins > maxAllowedWins) {
      return NextResponse.json(
        {
          success: false,
          message: `신청 승수(${parsedWins}WIN)가 남은 신청 가능 승수(${maxAllowedWins}WIN)를 초과했습니다. (총 ${actualWins}WIN 중 ${usedWins}WIN 기신청, 잔여 ${availableWins}WIN)`,
        },
        { status: 400 }
      );
    }

    const now = Date.now();
    const kstDate = new Date(now + 9 * 3600 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    const newApplication: RewardApplication = {
      id: `app_${now}_${Math.random().toString(36).substring(2, 8)}`,
      member: trimmedMember,
      totalWins: actualWins,
      requestedWins: parsedWins,
      walletAddress: trimmedWallet,
      memo: (memo || '').trim(),
      status: 'pending',
      notified: false,
      createdAt: now,
      date: kstDate,
    };

    await db.collection('reward_applications').insertOne(newApplication as any);

    // 관리자 텔레그램 봇 채널로 즉시 알림 전송 (Vercel 즉시 발송 + OCI2 백그라운드 2중 안전망)
    const cleanWallet = `<code>${trimmedWallet}</code>`;
    const cleanMemo = newApplication.memo ? newApplication.memo : '없음';
    const remainingAfterThis = availableWins - parsedWins;

    const telegramText =
      `🎁 <b>[AIAL Winner] 신규 리워드 신청 접수!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>신청 멤버:</b> <b>${trimmedMember}</b>\n` +
      `🏆 <b>보유 총 승수:</b> ${actualWins} WIN\n` +
      `📉 <b>남은 신청 가능 승수:</b> <b>${remainingAfterThis} WIN</b> (신청 전 ${availableWins} WIN)\n` +
      `🎯 <b>이번 신청 차감 승수:</b> <b>${parsedWins} WIN</b> (5WIN 단위)\n` +
      `💳 <b>지갑 주소 (SOL):</b> ${cleanWallet}\n` +
      `📝 <b>신청자 메모:</b> ${cleanMemo}\n` +
      `⏰ <b>신청 일시:</b> ${kstDate} (KST)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>관리자님, 온체인 SOL 전송 후 리워드 현황에 영수증을 등록해주세요!</i>`;

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
        await db.collection('reward_applications').updateOne(
          { id: newApplication.id },
          { $set: { notified: true, notifiedAt: Date.now() } }
        );
      } else {
        const teleErr = await teleResp.text();
        console.warn('Telegram send failed:', teleErr);
      }
    } catch (teleErr) {
      console.error('Failed to send telegram alert for reward application:', teleErr);
    }

    return NextResponse.json({
      success: true,
      message: '리워드 신청이 성공적으로 접수되었습니다!',
      application: newApplication,
      remainingAvailableWins: remainingAfterThis,
    });
  } catch (err: any) {
    console.error('Failed to process reward application:', err);
    return NextResponse.json(
      { success: false, message: err.message || '신청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
