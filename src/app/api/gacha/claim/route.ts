import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getTelegramConfig } from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { winId, member, walletAddress, memo, action = 'claim' } = body || {};

    if (!winId || !member) {
      return NextResponse.json(
        { success: false, message: '당첨 ID(winId)와 멤버 정보가 필요합니다.' },
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

    const winDoc = (await db.collection('gacha_wins').findOne({
      $or: [{ id: winId }, { _id: winId as any }],
    })) as any;

    if (!winDoc) {
      return NextResponse.json(
        { success: false, message: '해당 당첨 기록을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (winDoc.member !== member) {
      return NextResponse.json(
        { success: false, message: '당첨자 본인 정보와 일치하지 않습니다.' },
        { status: 403 }
      );
    }

    // 1. 상자 뜯기(개봉) 단계만 기록하는 경우
    if (action === 'unbox') {
      await db.collection('gacha_wins').updateOne(
        { $or: [{ id: winId }, { _id: winId as any }] },
        { $set: { unboxed: true } }
      );
      return NextResponse.json({
        success: true,
        win: {
          ...winDoc,
          id: winDoc.id || winDoc._id.toString(),
          unboxed: true,
        },
      });
    }

    // 2. 솔라나 지갑 수령 신청 및 관리자 텔레그램 알림 발송
    const trimmedWallet = (walletAddress || '').trim();
    if (!trimmedWallet) {
      return NextResponse.json(
        { success: false, message: 'SOL을 수령할 솔라나 지갑 주소를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (winDoc.claimStatus === 'pending' || winDoc.claimStatus === 'completed') {
      return NextResponse.json(
        { success: false, message: '이미 수령 신청이 완료된 당첨 상자입니다.' },
        { status: 409 }
      );
    }

    const now = Date.now();
    const kstDate = new Date(now + 9 * 3600 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);
    const trimmedMemo = (memo || '').trim();
    const rewardAmount = typeof winDoc.rewardAmount === 'number' ? winDoc.rewardAmount : 0.005;

    await db.collection('gacha_wins').updateOne(
      { $or: [{ id: winId }, { _id: winId as any }] },
      {
        $set: {
          unboxed: true,
          claimStatus: 'pending',
          walletAddress: trimmedWallet,
          memo: trimmedMemo,
          claimedAt: now,
        },
      }
    );

    const { token: teleToken, chatId: teleChatId } = getTelegramConfig();
    const telegramText =
      `🎰 <b>[AIAL Winner] UFO 뽑기 당첨 리워드 신청!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>당첨 멤버:</b> <b>${member}</b>\n` +
      `📦 <b>획득 상자:</b> ${winDoc.boxLabel || 'SOL 캡슐'}\n` +
      `🪙 <b>당첨 보상:</b> <b>${rewardAmount} SOL</b>\n` +
      `💳 <b>지갑 주소 (SOL):</b> <code>${trimmedWallet}</code>\n` +
      `📝 <b>신청자 메모:</b> ${trimmedMemo || '없음'}\n` +
      `⏰ <b>신청 일시:</b> ${kstDate} (KST)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>관리자님, SOL 전송 후 명예의 전당 → 리워드 현황에 영수증을 등록해주세요!</i>`;

    let notified = false;
    try {
      const teleResp = await fetch(`https://api.telegram.org/bot${teleToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: teleChatId,
          text: telegramText,
          parse_mode: 'HTML',
        }),
      });
      if (teleResp.ok) {
        notified = true;
        await db.collection('gacha_wins').updateOne(
          { $or: [{ id: winId }, { _id: winId as any }] },
          { $set: { notified: true } }
        );
      } else {
        console.warn('Telegram gacha claim notify failed:', await teleResp.text());
      }
    } catch (teleErr) {
      console.error('Telegram gacha claim alert error:', teleErr);
    }

    return NextResponse.json({
      success: true,
      notified,
      message: `${rewardAmount} SOL 수령 신청이 관리자에게 텔레그램으로 전송되었습니다!`,
    });
  } catch (error: any) {
    console.error('Failed to claim gacha win:', error);
    return NextResponse.json(
      { success: false, message: '당첨 수령 처리 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
