import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem } from '@/types/gacha';
import {
  createBoxForSlot,
  createInitialGachaBoxes,
  GACHA_ALL_SLOT_INDICES,
  GACHA_TOTAL_SLOTS,
  getBoxDimensions,
  getNearestSeatIndex,
  getRestingBoxPosition,
  shuffleIndices,
} from '@/constants/gacha';
import { getTelegramConfig, recordGachaLog } from '@/lib/gachaServer';

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

    const isRefillCmd = normalized === '리필' || normalized === '뽑기판리필';
    const isResetCmd =
      normalized === '정렬' ||
      normalized === '재정렬' ||
      normalized === '뽑기판정렬' ||
      normalized === '뽑기판재정렬';
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
    const existing = (await col.findOne({ _id: 'main_ufo_bridge' as any })) as any;
    const now = Date.now();
    const currentItems: GachaBoxItem[] = Array.isArray(existing?.items) ? existing.items : [];
    const isLocked = Boolean(
      existing?.lock?.active && existing?.lock?.expiresAt && existing.lock.expiresAt > now
    );

    // [상태 / 재고 조회]
    if (isStatusCmd) {
      const sorted = [...currentItems].sort(
        (a, b) => (a.seatIndex ?? a.position?.[0] ?? 0) - (b.seatIndex ?? b.position?.[0] ?? 0)
      );
      const listText =
        sorted.length > 0
          ? sorted.map((it, idx) => `${idx + 1}. ${it.label}`).join('\n')
          : '(남은 상품 없음)';
      const lockText = isLocked
        ? `🔒 현재 <b>${existing.lock.member}</b>님 조작 중`
        : '🟢 대기 중 (조작 가능)';
      await sendTelegramReply(
        token,
        senderChatId,
        `🎰 <b>UFO 뽑기판 현황</b>\n` +
          `• 상태: ${lockText}\n` +
          `• 남은 재고: <b>${sorted.length} / ${GACHA_TOTAL_SLOTS}개</b>\n\n` +
          `${listText}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // 누군가가 조작 중이면 안전을 위해 안내 후 중단
    if (isLocked) {
      await sendTelegramReply(
        token,
        senderChatId,
        `⚠️ 현재 <b>${existing.lock.member}</b>님이 크레인을 조작 중입니다. 조작이 끝난 뒤 다시 <b>${rawText}</b>을 입력해주세요!`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    const clearedLock = {
      active: false,
      member: null,
      turnId: null,
      startedAt: null,
      expiresAt: null,
    };

    // [리필 명령]
    if (isRefillCmd) {
      const occupiedSlots = new Set(currentItems.map((it) => it.slotIndex));
      const missingSlots = GACHA_ALL_SLOT_INDICES.filter((idx) => !occupiedSlots.has(idx));

      if (missingSlots.length === 0) {
        await sendTelegramReply(
          token,
          senderChatId,
          `📦 이미 상품 <b>${GACHA_TOTAL_SLOTS}개</b>가 모두 채워져 있습니다!`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      let nextItems: GachaBoxItem[];
      if (currentItems.length === 0) {
        nextItems = createInitialGachaBoxes();
      } else {
        nextItems = [...currentItems];
        const usedSeats = new Set<number>(
          nextItems.map((it) =>
            typeof it.seatIndex === 'number' ? it.seatIndex : getNearestSeatIndex(it.position[0])
          )
        );
        const freeSeats = shuffleIndices(GACHA_ALL_SLOT_INDICES.filter((s) => !usedSeats.has(s)));
        const shuffledMissing = shuffleIndices([...missingSlots]);

        for (let i = 0; i < shuffledMissing.length; i++) {
          const slotIdx = shuffledMissing[i];
          const seatIdx = freeSeats[i] !== undefined ? freeSeats[i] : slotIdx;
          const newBox = createBoxForSlot(slotIdx, now + i * 10, seatIdx);
          const [rx, ry, rz] = getRestingBoxPosition(slotIdx, seatIdx);
          const overlapsExisting = nextItems.some(
            (item) => Math.abs(item.position[0] - rx) < 0.92 && item.position[1] > 0.35
          );
          if (overlapsExisting) {
            const { h } = getBoxDimensions(slotIdx);
            newBox.position = [rx, ry + h + 0.25, rz];
          }
          nextItems.push(newBox);
        }
        nextItems.sort((a, b) => (a.seatIndex ?? a.slotIndex) - (b.seatIndex ?? b.slotIndex));
      }

      const refilledCount = missingSlots.length;
      const summary =
        refilledCount === GACHA_TOTAL_SLOTS
          ? `📦 운영자(텔레그램)가 ${GACHA_TOTAL_SLOTS}개 상품을 모두 랜덤 배치로 새로 리필했습니다!`
          : `📦 운영자(텔레그램)가 빈 자리 상품 ${refilledCount}개를 랜덤 리필했습니다! (총 ${nextItems.length}개)`;

      await col.updateOne(
        { _id: 'main_ufo_bridge' as any },
        {
          $set: {
            id: 'main_ufo_bridge',
            items: nextItems,
            lock: clearedLock,
            lastActionSummary: summary,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      await recordGachaLog(db, {
        type: 'admin_refill',
        member: '관리자(텔레그램)',
        message: summary,
        meta: { refilledCount, totalStock: nextItems.length, source: 'telegram' },
        createdAt: now,
      });

      const orderList = nextItems.map((it, idx) => `${idx + 1}. ${it.label}`).join('\n');
      await sendTelegramReply(
        token,
        senderChatId,
        `✅ <b>뽑기판 리필 완료!</b>\n` +
          `• 보충 수량: <b>${refilledCount}개</b> (현재 총 <b>${nextItems.length}/${GACHA_TOTAL_SLOTS}개</b>)\n\n` +
          `<b>현재 배치 (좌→우):</b>\n${orderList}`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [정렬 / 재정렬 명령]
    if (isResetCmd) {
      if (currentItems.length === 0) {
        await sendTelegramReply(
          token,
          senderChatId,
          `📦 현재 남아있는 상품이 0개여서 재정렬할 대상이 없습니다. <b>리필</b>이라고 입력하면 5개가 새로 채워집니다!`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      const takenSeats = new Set<number>();
      const resetItems: GachaBoxItem[] = currentItems.map((item) => {
        let seat =
          typeof item.seatIndex === 'number'
            ? item.seatIndex
            : getNearestSeatIndex(item.position?.[0] ?? 0);
        if (takenSeats.has(seat)) {
          const free = GACHA_ALL_SLOT_INDICES.find((s) => !takenSeats.has(s));
          if (free !== undefined) seat = free;
        }
        takenSeats.add(seat);
        return {
          ...item,
          seatIndex: seat,
          position: getRestingBoxPosition(item.slotIndex, seat),
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
        };
      });
      resetItems.sort((a, b) => (a.seatIndex ?? a.slotIndex) - (b.seatIndex ?? b.slotIndex));

      const summary = `🔄 운영자(텔레그램)가 남은 상품 ${resetItems.length}개를 초기 정위치로 재정렬했습니다.`;

      await col.updateOne(
        { _id: 'main_ufo_bridge' as any },
        {
          $set: {
            id: 'main_ufo_bridge',
            items: resetItems,
            lock: clearedLock,
            lastActionSummary: summary,
            updatedAt: now,
          },
          $inc: { resetCount: 1 },
        },
        { upsert: true }
      );

      await recordGachaLog(db, {
        type: 'admin_reset',
        member: '관리자(텔레그램)',
        message: summary,
        meta: { remainingStock: resetItems.length, source: 'telegram' },
        createdAt: now,
      });

      const orderList = resetItems.map((it, idx) => `${idx + 1}. ${it.label}`).join('\n');
      await sendTelegramReply(
        token,
        senderChatId,
        `✅ <b>뽑기판 재정렬 완료!</b>\n` +
          `• 정위치 복구: <b>${resetItems.length}개</b>\n\n` +
          `<b>현재 배치 (좌→우):</b>\n${orderList}`,
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
