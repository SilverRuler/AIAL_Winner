import { NextRequest, NextResponse } from 'next/server';
import https from 'node:https';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import {
  createSingleMachineItems,
  GACHA_TOTAL_SLOTS,
  getMachineDocId,
  getMachineLabel,
  getRestingBoxPosition,
} from '@/constants/gacha';
import { MEMBERS } from '@/constants/members';
import {
  getAllMachineStates,
  getAllMemberTicketBalances,
  getGachaMachineOps,
  getLatestScheduledCheckpoint,
  getTelegramConfig,
  grantGachaTickets,
  recordGachaLog,
  setGachaMachineOps,
} from '@/lib/gachaServer';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'aial_gacha_tg_secret_261125';

function buildWebhookReply(
  chatId: string | number,
  text: string,
  replyToMessageId?: number
) {
  const payload: Record<string, any> = {
    method: 'sendMessage',
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }
  return NextResponse.json(payload);
}

async function sendTelegramReply(
  token: string,
  chatId: string | number,
  text: string,
  replyToMessageId?: number
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    const bodyStr = JSON.stringify(payload);
    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${token}/sendMessage`,
          method: 'POST',
          family: 4, // IPv4 강제 (oci2 IPv6 미지원으로 인한 Node Happy Eyeballs ETIMEDOUT 방지)
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error('Telegram IPv4 request timeout'));
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
    return true;
  } catch (err) {
    console.error('Failed to send Telegram webhook reply:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Webhook 시크릿 헤더 검증
    const reqSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (WEBHOOK_SECRET && reqSecret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const update = await request.json().catch(() => null);
    const msg = update?.message || update?.edited_message;
    if (!msg || !msg.text) {
      return NextResponse.json({ ok: true });
    }

    const { token, chatId: adminChatId } = getTelegramConfig();
    const senderChatId = String(msg.chat?.id ?? '');

    // 2. 지정된 관리자 채팅방(TELEGRAM_CHAT_ID)에서만 명령어 실행 허용
    if (!adminChatId || senderChatId !== String(adminChatId)) {
      return NextResponse.json({ ok: true });
    }

    const rawText = String(msg.text).trim();
    const normalized = rawText.replace(/^\/+/, '').replace(/\s+/g, '');
    const replyToId = typeof msg.message_id === 'number' ? msg.message_id : undefined;

    // 1) 개별 뽑기판 명령: "1번 리필", "1번 재정렬", "1번 정렬" (1~12번)
    const exactMatch = normalized.match(/^(\d{1,2})번(리필|재정렬|정렬)$/);
    const rawSlotNum = exactMatch ? Number(exactMatch[1]) : null;
    const requestedSlotNum =
      rawSlotNum && rawSlotNum >= 1 && rawSlotNum <= GACHA_TOTAL_SLOTS ? rawSlotNum : null;
    const actionWord = requestedSlotNum && exactMatch ? exactMatch[2] : null;

    const isRefillCmd = actionWord === '리필';
    const isResetCmd = actionWord === '재정렬' || actionWord === '정렬';
    const isStatusCmd = normalized === '상태' || normalized === '재고';
    const isHelpCmd = normalized === '위너' || normalized === '명령어' || normalized === '도움말';

    // 2) 전체 유저 티켓 지급 명령: "전체 유저 N티켓 지급" (예: 전체 유저 1티켓 지급)
    const grantAllMatch = normalized.match(/^전체유저(\d+)티켓지급$/);
    const grantAllAmount = grantAllMatch ? Number(grantAllMatch[1]) : null;

    // 3) 전 기기 운영 제어 명령: "전 기기 운영 중단", "전 기기 운영 재개", "전 기기 상품 제거"
    const isSuspendAllCmd = normalized === '전기기운영중단';
    const isResumeAllCmd = normalized === '전기기운영재개';
    const isClearAllItemsCmd = normalized === '전기기상품제거';

    if (isHelpCmd) {
      return buildWebhookReply(
        senderChatId,
        `📖 <b>AIAL Winner &amp; UFO 뽑기 텔레그램 관리자 명령어</b>\n\n` +
          `<b>[1] 현황 조회</b>\n` +
          `• <code>상태</code> 또는 <code>재고</code> — 전체 ${GACHA_TOTAL_SLOTS}개 뽑기판 재고·잠금·운영 상태 조회\n` +
          `• <code>/위너</code> — 관리자 명령어 전체 목록 보기\n\n` +
          `<b>[2] 개별 뽑기판 관리 (1~${GACHA_TOTAL_SLOTS}번 지정 필수)</b>\n` +
          `• <code>1번 리필</code> ~ <code>${GACHA_TOTAL_SLOTS}번 리필</code> — 품절된 해당 뽑기판 상품 보충\n` +
          `• <code>1번 재정렬</code> ~ <code>${GACHA_TOTAL_SLOTS}번 재정렬</code> — 해당 뽑기판 상품 중앙 정위치 복구\n` +
          `• <code>1번 정렬</code> ~ <code>${GACHA_TOTAL_SLOTS}번 정렬</code> — 재정렬과 동일\n\n` +
          `<b>[3] 티켓 일괄 지급</b>\n` +
          `• <code>전체 유저 1티켓 지급</code> — 12명 전원에게 뽑기권 +N장 지급 (숫자 자유 변경)\n\n` +
          `<b>[4] 전 기기 일괄 제어</b>\n` +
          `• <code>전 기기 운영 중단</code> — 전체 뽑기판 점검중 전환 및 플레이 차단\n` +
          `• <code>전 기기 운영 재개</code> — 전 기기 점검중 해제 및 정상 운영 복귀\n` +
          `• <code>전 기기 상품 제거</code> — 1~${GACHA_TOTAL_SLOTS}번 모든 기기의 상품 일괄 제거\n\n` +
          `<i>※ 자동 알림(식사 등록·댓글·리워드 신청)은 백그라운드 봇이 상시 발송합니다.</i>`,
        replyToId
      );
    }

    if (
      !isRefillCmd &&
      !isResetCmd &&
      !isStatusCmd &&
      grantAllAmount === null &&
      !isSuspendAllCmd &&
      !isResumeAllCmd &&
      !isClearAllItemsCmd
    ) {
      return NextResponse.json({ ok: true });
    }

    const db = await getDatabase();
    if (!db) {
      await sendTelegramReply(token, senderChatId, '❌ DB 연결에 실패했습니다.', replyToId);
      return NextResponse.json({ ok: true });
    }

    const col = db.collection('gacha_machine');
    const now = Date.now();
    const machines = await getAllMachineStates(db);
    const machineOps = await getGachaMachineOps(db);

    const formatMachineStatusList = (list: typeof machines) =>
      list
        .map((m) => {
          const locked = Boolean(m.lock?.active && m.lock?.expiresAt && m.lock.expiresAt > now);
          const stockBadge = m.items.length > 0 ? '🟢 있음' : '🔴 품절';
          const lockBadge = locked ? ` (🔒 ${m.lock.member}님 조작 중)` : '';
          return `${m.machineIndex + 1}. ${m.machineLabel} — ${stockBadge}${lockBadge}`;
        })
        .join('\n');

    // [전체 유저 N티켓 지급]
    if (grantAllAmount !== null) {
      if (!Number.isInteger(grantAllAmount) || grantAllAmount < 1 || grantAllAmount > 1000) {
        await sendTelegramReply(
          token,
          senderChatId,
          '❌ 지급 수량은 1 ~ 1000 사이의 정수로 입력해주세요. (예: <b>전체 유저 1티켓 지급</b>)',
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      for (const m of MEMBERS) {
        await grantGachaTickets(db, m.name, grantAllAmount);
      }

      const balances = await getAllMemberTicketBalances(db);
      const summaryLines = MEMBERS.map(
        (m) => `• ${m.name}: <b>${balances[m.name]?.tickets ?? 0}장</b>`
      ).join('\n');

      await recordGachaLog(db, {
        type: 'admin_grant_all',
        member: '관리자(텔레그램)',
        message: `🎟️ 운영자(텔레그램)가 전체 12명 유저에게 뽑기권 +${grantAllAmount}장을 일괄 지급했습니다.`,
        meta: { amount: grantAllAmount, memberCount: MEMBERS.length, source: 'telegram' },
        createdAt: now,
      });

      await sendTelegramReply(
        token,
        senderChatId,
        `🎟️ <b>전체 유저(${MEMBERS.length}명) 뽑기권 +${grantAllAmount}장 지급 완료!</b>\n\n${summaryLines}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [전 기기 운영 중단]
    if (isSuspendAllCmd) {
      await setGachaMachineOps(db, true, 'telegram');
      await recordGachaLog(db, {
        type: 'admin_ops',
        member: '관리자(텔레그램)',
        message: '🛑 운영자(텔레그램)가 전 기기 운영 중단(점검중)을 실행했습니다.',
        meta: { suspended: true, source: 'telegram' },
        createdAt: now,
      });
      await sendTelegramReply(
        token,
        senderChatId,
        `🛑 <b>전 기기 운영 중단(점검중) 적용 완료!</b>\n` +
          `• 모든 뽑기판이 점검중 상태로 잠기며 뽑기 시작이 차단됩니다.\n` +
          `• 해제하려면 <b>전 기기 운영 재개</b>라고 입력하세요.`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [전 기기 운영 재개]
    if (isResumeAllCmd) {
      await setGachaMachineOps(db, false, 'telegram');
      await recordGachaLog(db, {
        type: 'admin_ops',
        member: '관리자(텔레그램)',
        message: '🟢 운영자(텔레그램)가 전 기기 운영을 재개했습니다.',
        meta: { suspended: false, source: 'telegram' },
        createdAt: now,
      });
      await sendTelegramReply(
        token,
        senderChatId,
        `🟢 <b>전 기기 운영 재개 완료!</b>\n모든 뽑기판이 정상 운영 상태로 복귀했습니다.`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [전 기기 상품 제거]
    if (isClearAllItemsCmd) {
      const latestCp = getLatestScheduledCheckpoint(now);
      const clearedLock = {
        active: false,
        member: null,
        turnId: null,
        startedAt: null,
        expiresAt: null,
      };
      for (let idx = 0; idx < GACHA_TOTAL_SLOTS; idx++) {
        const docId = getMachineDocId(idx);
        const machineLabel = getMachineLabel(idx);
        await col.updateOne(
          { _id: docId as any },
          {
            $set: {
              id: docId,
              machineIndex: idx,
              slotIndex: idx,
              machineLabel,
              items: [],
              lock: clearedLock,
              lastAutoResetSlot: latestCp.key,
              lastAutoResetAt: now,
              lastActionSummary: `🧹 운영자(텔레그램)가 전 기기의 상품을 모두 제거했습니다.`,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
      }
      const updatedMachines = await getAllMachineStates(db);
      await recordGachaLog(db, {
        type: 'admin_clear_all',
        member: '관리자(텔레그램)',
        message: '🧹 운영자(텔레그램)가 전 기기(1~6번)의 상품을 모두 제거했습니다.',
        meta: { clearedMachines: GACHA_TOTAL_SLOTS, source: 'telegram' },
        createdAt: now,
      });
      await sendTelegramReply(
        token,
        senderChatId,
        `🧹 <b>전 기기 상품 제거 완료! (0/${GACHA_TOTAL_SLOTS}개)</b>\n\n` +
          `${formatMachineStatusList(updatedMachines)}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [상태 / 재고 조회]
    if (isStatusCmd) {
      const totalStock = machines.reduce((sum, m) => sum + m.items.length, 0);
      const opsBadge = machineOps.suspended ? '🛑 점검중 (운영 중단)' : '🟢 정상 운영 중';
      await sendTelegramReply(
        token,
        senderChatId,
        `🎰 <b>개별 UFO 뽑기판 현황 (${totalStock}/${GACHA_TOTAL_SLOTS}개)</b>\n` +
          `• 운영 상태: <b>${opsBadge}</b>\n\n` +
          `${formatMachineStatusList(machines)}\n\n` +
          `<i>💡 명령어: "1번 리필/재정렬/정렬", "전체 유저 1티켓 지급", "전 기기 운영 중단/재개", "전 기기 상품 제거"</i>`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    if (requestedSlotNum === null) {
      return NextResponse.json({ ok: true });
    }
    const targetIndices = [requestedSlotNum - 1];

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    // [리필 명령]
    if (isRefillCmd) {
      const refilled: string[] = [];
      const skippedLocked: string[] = [];

      for (const idx of targetIndices) {
        const m = machines[idx];
        if (!m) continue;
        const locked = Boolean(m.lock?.active && m.lock?.expiresAt && m.lock.expiresAt > now);
        if (locked) {
          skippedLocked.push(`${idx + 1}번(${m.lock.member}님 조작 중)`);
          continue;
        }
        if (m.items.length > 0) continue;

        const docId = getMachineDocId(idx);
        const machineLabel = getMachineLabel(idx);
        const freshItems = createSingleMachineItems(idx, now + idx * 10);
        const summary = `📦 운영자(텔레그램)가 [${idx + 1}번 뽑기판] ${machineLabel}을(를) 리필했습니다!`;

        await col.updateOne(
          { _id: docId as any },
          {
            $set: {
              id: docId,
              machineIndex: idx,
              slotIndex: idx,
              machineLabel,
              items: freshItems,
              lock: clearedLock,
              lastActionSummary: summary,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
        refilled.push(`${idx + 1}번 ${machineLabel}`);
      }

      const updatedMachines = await getAllMachineStates(db);
      const totalStock = updatedMachines.reduce((sum, m) => sum + m.items.length, 0);

      if (refilled.length === 0) {
        const lockNote =
          skippedLocked.length > 0 ? `\n⚠️ 조작 중 제외: ${skippedLocked.join(', ')}` : '';
        await sendTelegramReply(
          token,
          senderChatId,
          `📦 <b>${requestedSlotNum}번 뽑기판</b>(${getMachineLabel(requestedSlotNum - 1)})은 이미 상품이 채워져 있습니다! (전체 ${totalStock}/${GACHA_TOTAL_SLOTS}개)${lockNote}`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      const logMsg = `📦 운영자(텔레그램)가 ${refilled.length}개 뽑기판(${refilled.join(', ')})을 리필했습니다! (전체 ${totalStock}/${GACHA_TOTAL_SLOTS}개)`;
      await recordGachaLog(db, {
        type: 'admin_refill',
        member: '관리자(텔레그램)',
        message: logMsg,
        meta: { refilledCount: refilled.length, totalStock, source: 'telegram' },
        createdAt: now,
      });

      const lockNote =
        skippedLocked.length > 0 ? `\n⚠️ 조작 중 제외: ${skippedLocked.join(', ')}` : '';
      await sendTelegramReply(
        token,
        senderChatId,
        `✅ <b>뽑기판 리필 완료!</b>\n` +
          `• 보충: <b>${refilled.length}개</b> (전체 <b>${totalStock}/${GACHA_TOTAL_SLOTS}개</b>)${lockNote}\n\n` +
          `${formatMachineStatusList(updatedMachines)}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [정렬 / 재정렬 명령]
    if (isResetCmd) {
      const resetDone: string[] = [];
      const skippedLocked: string[] = [];

      for (const idx of targetIndices) {
        const m = machines[idx];
        if (!m) continue;
        const locked = Boolean(m.lock?.active && m.lock?.expiresAt && m.lock.expiresAt > now);
        if (locked) {
          skippedLocked.push(`${idx + 1}번(${m.lock.member}님 조작 중)`);
          continue;
        }
        if (m.items.length === 0) continue;

        const docId = getMachineDocId(idx);
        const machineLabel = getMachineLabel(idx);
        const resetItems: GachaBoxItem[] = m.items.map((item) => ({
          ...item,
          slotIndex: idx,
          seatIndex: 0,
          position: getRestingBoxPosition(idx, 0),
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
          isInitialState: true,
        }));
        const summary = `🔄 운영자(텔레그램)가 [${idx + 1}번 뽑기판] ${machineLabel}을(를) 중앙 정위치로 재정렬했습니다.`;

        await col.updateOne(
          { _id: docId as any },
          {
            $set: {
              id: docId,
              machineIndex: idx,
              slotIndex: idx,
              machineLabel,
              items: resetItems,
              lock: clearedLock,
              lastActionSummary: summary,
              updatedAt: now,
            },
            $inc: { resetCount: 1 },
          },
          { upsert: true }
        );
        resetDone.push(`${idx + 1}번 ${machineLabel}`);
      }

      const updatedMachines = await getAllMachineStates(db);
      if (resetDone.length === 0) {
        const lockNote =
          skippedLocked.length > 0 ? `\n⚠️ 조작 중 제외: ${skippedLocked.join(', ')}` : '';
        await sendTelegramReply(
          token,
          senderChatId,
          `📦 <b>${requestedSlotNum}번 뽑기판</b>에 재정렬할 상품이 없습니다. <b>${requestedSlotNum}번 리필</b>이라고 입력하면 채워집니다!${lockNote}`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      const logMsg = `🔄 운영자(텔레그램)가 ${resetDone.length}개 뽑기판(${resetDone.join(', ')})을 정위치로 재정렬했습니다.`;
      await recordGachaLog(db, {
        type: 'admin_reset',
        member: '관리자(텔레그램)',
        message: logMsg,
        meta: { remainingStock: resetDone.length, source: 'telegram' },
        createdAt: now,
      });

      const lockNote =
        skippedLocked.length > 0 ? `\n⚠️ 조작 중 제외: ${skippedLocked.join(', ')}` : '';
      await sendTelegramReply(
        token,
        senderChatId,
        `✅ <b>뽑기판 재정렬 완료!</b>\n` +
          `• 정위치 복구: <b>${resetDone.length}개</b>${lockNote}\n\n` +
          `${formatMachineStatusList(updatedMachines)}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
