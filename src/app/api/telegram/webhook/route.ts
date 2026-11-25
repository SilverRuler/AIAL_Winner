import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import {
  createSingleMachineItems,
  GACHA_ALL_SLOT_INDICES,
  GACHA_TOTAL_SLOTS,
  getMachineDocId,
  getMachineLabel,
  getRestingBoxPosition,
} from '@/constants/gacha';
import { getAllMachineStates, getTelegramConfig, recordGachaLog } from '@/lib/gachaServer';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'aial_gacha_tg_secret_261125';

async function sendTelegramReply(
  token: string,
  chatId: string | number,
  text: string,
  replyToMessageId?: number
) {
  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('Failed to send Telegram webhook reply:', err);
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

    // 특정 번호 지정 지원: 예) "리필 3", "정렬 6" 또는 전체 "리필", "정렬", "재정렬"
    const numMatch = normalized.match(/^(.+?)([1-6])$/);
    const baseCmd = numMatch ? numMatch[1] : normalized;
    const requestedSlotNum = numMatch ? Number(numMatch[2]) : null; // 1..6

    const isRefillCmd = baseCmd === '리필' || baseCmd === '뽑기판리필';
    const isResetCmd =
      baseCmd === '정렬' ||
      baseCmd === '재정렬' ||
      baseCmd === '뽑기판정렬' ||
      baseCmd === '뽑기판재정렬';
    const isStatusCmd = normalized === '상태' || normalized === '재고';

    if (!isRefillCmd && !isResetCmd && !isStatusCmd) {
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

    const formatMachineStatusList = (list: typeof machines) =>
      list
        .map((m) => {
          const locked = Boolean(m.lock?.active && m.lock?.expiresAt && m.lock.expiresAt > now);
          const stockBadge = m.items.length > 0 ? '🟢 있음' : '🔴 품절';
          const lockBadge = locked ? ` (🔒 ${m.lock.member}님 조작 중)` : '';
          return `${m.machineIndex + 1}. ${m.machineLabel} — ${stockBadge}${lockBadge}`;
        })
        .join('\n');

    // [상태 / 재고 조회]
    if (isStatusCmd) {
      const totalStock = machines.reduce((sum, m) => sum + m.items.length, 0);
      await sendTelegramReply(
        token,
        senderChatId,
        `🎰 <b>개별 UFO 뽑기판 현황 (${totalStock}/${GACHA_TOTAL_SLOTS}개)</b>\n\n` +
          `${formatMachineStatusList(machines)}\n\n` +
          `<i>💡 팁: "리필" / "리필 3" / "재정렬" / "재정렬 3" 모두 지원</i>`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    const targetIndices =
      requestedSlotNum !== null ? [requestedSlotNum - 1] : [...GACHA_ALL_SLOT_INDICES];

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
          `📦 리필할 빈 뽑기판이 없습니다! (현재 ${totalStock}/${GACHA_TOTAL_SLOTS}개)${lockNote}`,
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
          `📦 재정렬할 남은 상품이 없습니다. <b>리필</b>이라고 입력하면 빈 뽑기판이 채워집니다!${lockNote}`,
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
