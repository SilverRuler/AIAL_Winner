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
  setSingleMachineSuspended,
} from '@/lib/gachaServer';
import { getActivePresenceSummary } from '@/lib/presence';
import { getWinSiteMode, switchWinSiteMode } from '@/lib/siteMode';

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

    // 1) 개별 뽑기판 명령: "1번 리필", "1번 재정렬", "1번 정렬" (1~13번)
    const exactMatch = normalized.match(/^(\d{1,2})번(리필|재정렬|정렬)$/);
    const rawSlotNum = exactMatch ? Number(exactMatch[1]) : null;
    const requestedSlotNum =
      rawSlotNum && rawSlotNum >= 1 && rawSlotNum <= GACHA_TOTAL_SLOTS ? rawSlotNum : null;
    const actionWord = requestedSlotNum && exactMatch ? exactMatch[2] : null;

    // 1-2) 개별 기기 운영 중단/재개 명령: "3번 기기 운영 중단", "3번 기기 운영 재개" (축약: "3번 기기 중단/재개", "3번 운영 중단/재개")
    const singleOpsMatch = normalized.match(/^(\d{1,2})번(?:기기)?(?:운영)?(중단|재개)$/);
    const singleOpsRawSlot = singleOpsMatch ? Number(singleOpsMatch[1]) : null;
    const singleOpsSlotNum =
      singleOpsRawSlot && singleOpsRawSlot >= 1 && singleOpsRawSlot <= GACHA_TOTAL_SLOTS
        ? singleOpsRawSlot
        : null;
    const singleOpsAction =
      singleOpsSlotNum && singleOpsMatch ? (singleOpsMatch[2] as '중단' | '재개') : null;

    const isRefillCmd = actionWord === '리필';
    const isResetCmd = actionWord === '재정렬' || actionWord === '정렬';
    const isStatusCmd = normalized === '상태' || normalized === '재고';
    const isPresenceCmd =
      normalized === '동접' || normalized === '접속자' || normalized === '동접자';
    const isHelpCmd = normalized === '위너' || normalized === '명령어' || normalized === '도움말';

    // 2) 티켓 지급/차감 명령:
    //    - 전체: "전체 유저 N티켓 지급" (예: 전체 유저 1티켓 지급)
    //    - 개별: "{닉네임} 유저 N티켓 지급" 또는 "{닉네임} N티켓 지급" (예: 재쫄 유저 10티켓 지급, 재쫄 유저 5티켓 차감)
    const grantAllMatch = normalized.match(/^전체유저(\d+)티켓지급$/);
    const grantAllAmount = grantAllMatch ? Number(grantAllMatch[1]) : null;
    const grantUserMatch =
      grantAllAmount === null ? normalized.match(/^(.+?)(?:유저)?(\d+)티켓(지급|차감)$/) : null;
    const grantUserRawTarget = grantUserMatch ? grantUserMatch[1] : null;
    const grantUserAmount = grantUserMatch ? Number(grantUserMatch[2]) : null;
    const grantUserAction = grantUserMatch ? (grantUserMatch[3] as '지급' | '차감') : null;

    // 3) 전 기기 운영 제어 및 서비스 모드 전환 명령
    const isSuspendAllCmd = normalized === '전기기운영중단';
    const isResumeAllCmd = normalized === '전기기운영재개';
    const isClearAllItemsCmd = normalized === '전기기상품제거';
    const isDevModeCmd = normalized === '개발모드';
    const isNormalModeCmd = normalized === '일반모드';

    if (isHelpCmd) {
      return buildWebhookReply(
        senderChatId,
        `📖 <b>AIAL Winner &amp; UFO 뽑기 텔레그램 관리자 명령어</b>\n\n` +
          `<b>[0] 원클릭 모드 전환 (사이트 + 뽑기판 동시 제어)</b>\n` +
          `• <code>개발 모드</code> — <code>win.silverruler.xyz</code> 점검 페이지 전환 + 전 기기 운영 중단\n` +
          `• <code>일반 모드</code> — <code>win.silverruler.xyz</code> 정상 서비스 복귀 + 전 기기 운영 재개\n\n` +
          `<b>[1] 현황 조회</b>\n` +
          `• <code>상태</code> 또는 <code>재고</code> — 사이트 모드·동접·전체 ${GACHA_TOTAL_SLOTS}개 뽑기판 재고 조회\n` +
          `• <code>동접</code> 또는 <code>접속자</code> — 실시간 IP별 동접 현황 조회 (기기·닉·위치)\n` +
          `• <code>/위너</code> — 관리자 명령어 전체 목록 보기\n\n` +
          `<b>[2] 개별 뽑기판 관리 (1~${GACHA_TOTAL_SLOTS}번 지정 필수)</b>\n` +
          `• <code>1번 리필</code> ~ <code>${GACHA_TOTAL_SLOTS}번 리필</code> — 품절된 해당 뽑기판 상품 보충\n` +
          `• <code>1번 재정렬</code> ~ <code>${GACHA_TOTAL_SLOTS}번 재정렬</code> — 해당 뽑기판 상품 중앙 정위치 복구\n` +
          `• <code>1번 정렬</code> ~ <code>${GACHA_TOTAL_SLOTS}번 정렬</code> — 재정렬과 동일\n` +
          `• <code>3번 기기 운영 중단</code> — 해당 번호 기기만 개별 점검중 전환 및 플레이 차단\n` +
          `• <code>3번 기기 운영 재개</code> — 해당 번호 기기 개별 점검중 해제\n\n` +
          `<b>[3] 티켓 지급 / 차감</b>\n` +
          `• <code>전체 유저 1티켓 지급</code> — 12명 전원에게 뽑기권 +N장 일괄 지급\n` +
          `• <code>재쫄 유저 10티켓 지급</code> — 특정 멤버에게 뽑기권 +N장 지급 (<code>차감</code>도 지원)\n\n` +
          `<b>[4] 전 기기 일괄 제어</b>\n` +
          `• <code>전 기기 운영 중단</code> — 전체 뽑기판 점검중 전환 및 플레이 차단\n` +
          `• <code>전 기기 운영 재개</code> — 전 기기 점검중 해제 및 정상 운영 복귀\n` +
          `• <code>전 기기 상품 제거</code> — 1~${GACHA_TOTAL_SLOTS}번 모든 기기의 상품 일괄 제거\n\n` +
          `<i>※ 자동 알림(식사 등록·댓글·리워드 신청)은 백그라운드 봇이 상시 발송합니다.</i>`,
        replyToId
      );
    }

    if (isPresenceCmd) {
      const p = getActivePresenceSummary();
      const fmtStay = (sec: number) => {
        if (sec < 60) return `${sec}초`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s > 0 ? `${m}분 ${s}초` : `${m}분`;
      };
      const lines =
        p.sessions.length === 0
          ? '• 현재 활성 접속자가 없습니다.'
          : p.sessions
              .map((s, idx) => {
                const dev = s.deviceType === 'Mobile' ? '📱' : '💻';
                const nickTag = s.member ? `<b>${s.member}</b>` : '방문자';
                const playTag = s.isPlaying ? ' 🕹️<b>조작중</b>' : '';
                return `${idx + 1}. <code>${s.ip}</code> ${dev}(${s.userAgentShort}) · ${nickTag} · ${s.page}${playTag} (체류 ${fmtStay(s.staySec)}, ${s.lastSeenAgoSec}초 전)`;
              })
              .join('\n');

      return buildWebhookReply(
        senderChatId,
        `🟢 <b>실시간 IP별 동접 현황 (총 ${p.totalActive}명 · 최근 ${p.ttlSec}초 활성)</b>\n` +
          `• 뽑기방: <b>${p.byArea.gacha}명</b> (조작중 ${p.playingCount}명) · 식사배틀: <b>${p.byArea.main}명</b> · 점검페이지: <b>${p.byArea.maintenance}명</b>\n\n` +
          `${lines}`,
        replyToId
      );
    }

    if (
      !isRefillCmd &&
      !isResetCmd &&
      !isStatusCmd &&
      grantAllAmount === null &&
      grantUserMatch === null &&
      singleOpsSlotNum === null &&
      !isSuspendAllCmd &&
      !isResumeAllCmd &&
      !isClearAllItemsCmd &&
      !isDevModeCmd &&
      !isNormalModeCmd
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

    const formatMachineStatusList = (list: typeof machines, suspendedList?: number[]) => {
      const suspSet = new Set(suspendedList ?? machineOps.suspendedMachines ?? []);
      return list
        .map((m) => {
          const locked = Boolean(m.lock?.active && m.lock?.expiresAt && m.lock.expiresAt > now);
          const isSusp = machineOps.suspended || suspSet.has(m.machineIndex);
          const stockBadge = isSusp
            ? '🛠️ 점검중'
            : m.items.length > 0
            ? `🟢 있음(${m.items.length})`
            : '🔴 품절';
          const lockBadge = locked ? ` (🔒 ${m.lock.member}님 조작 중)` : '';
          return `${m.machineIndex + 1}. ${m.machineLabel} — ${stockBadge}${lockBadge}`;
        })
        .join('\n');
    };

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

    // [특정 유저 N티켓 지급 / 차감] (예: 재쫄 유저 10티켓 지급)
    if (grantUserMatch !== null && grantUserRawTarget && grantUserAmount !== null && grantUserAction) {
      const targetMember = MEMBERS.find(
        (m) => m.name.replace(/\s+/g, '') === grantUserRawTarget
      );
      if (!targetMember) {
        const validList = MEMBERS.map((m) => m.name).join(', ');
        await sendTelegramReply(
          token,
          senderChatId,
          `❌ <b>${grantUserRawTarget}</b> 멤버를 찾을 수 없습니다.\n• 활동 멤버: ${validList}`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      if (!Number.isInteger(grantUserAmount) || grantUserAmount < 1 || grantUserAmount > 1000) {
        await sendTelegramReply(
          token,
          senderChatId,
          `❌ 수량은 1 ~ 1000 사이의 정수로 입력해주세요. (예: <b>${targetMember.name} 유저 10티켓 지급</b>)`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      const balancesBefore = await getAllMemberTicketBalances(db);
      const beforeTickets = balancesBefore[targetMember.name]?.tickets ?? 0;
      const delta = grantUserAction === '차감' ? -grantUserAmount : grantUserAmount;
      const afterTickets = await grantGachaTickets(db, targetMember.name, delta);
      const signText = delta > 0 ? `+${grantUserAmount}장 지급` : `-${grantUserAmount}장 차감`;

      await recordGachaLog(db, {
        type: 'admin_ticket',
        member: targetMember.name,
        message: `🎟️ 운영자(텔레그램)가 ${targetMember.name}님에게 뽑기권 ${signText}했습니다. (${beforeTickets}장 → ${afterTickets}장)`,
        meta: {
          targetMember: targetMember.name,
          delta,
          beforeTickets,
          afterTickets,
          source: 'telegram',
        },
        createdAt: now,
      });

      await sendTelegramReply(
        token,
        senderChatId,
        `🎟️ <b>${targetMember.name}님 뽑기권 ${signText} 완료!</b>\n` +
          `• 변동: <b>${beforeTickets}장 → ${afterTickets}장</b>`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [개발 모드: win.silverruler.xyz 점검 페이지 + 전 기기 운영 중단 동시 적용]
    if (isDevModeCmd) {
      const siteRes = switchWinSiteMode('dev');
      await setGachaMachineOps(db, true, 'telegram_dev_mode');
      await recordGachaLog(db, {
        type: 'admin_ops',
        member: '관리자(텔레그램)',
        message: '🛠️ 운영자(텔레그램)가 개발 모드(사이트 점검 페이지 + 전 기기 운영 중단)를 적용했습니다.',
        meta: { mode: 'dev', siteOk: siteRes.ok, suspended: true, source: 'telegram' },
        createdAt: now,
      });

      if (!siteRes.ok) {
        await sendTelegramReply(
          token,
          senderChatId,
          `⚠️ <b>개발 모드 부분 적용</b>\n` +
            `• 뽑기판: 🛑 <b>전 기기 운영 중단 적용 완료</b>\n` +
            `• 메인 사이트 전환 실패: <code>${siteRes.message}</code>`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramReply(
        token,
        senderChatId,
        `🛠️ <b>개발 모드 전환 완료!</b>\n` +
          `• <code>win.silverruler.xyz</code>: <b>점검중 페이지</b>로 전환\n` +
          `• 뽑기판 (4000/4100): 🛑 <b>전 기기 운영 중단</b> 적용 (진행 중 락 해제)\n` +
          `• 개발 테스트 주소: <code>windev.silverruler.xyz</code>\n\n` +
          `<i>💡 정상 서비스로 복구하려면 <b>일반 모드</b>라고 입력하세요.</i>`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [일반 모드: win.silverruler.xyz 정상 서비스 복귀 + 전 기기 운영 재개 동시 적용]
    if (isNormalModeCmd) {
      const siteRes = switchWinSiteMode('normal');
      await setGachaMachineOps(db, false, 'telegram_normal_mode');
      await recordGachaLog(db, {
        type: 'admin_ops',
        member: '관리자(텔레그램)',
        message: '🟢 운영자(텔레그램)가 일반 모드(사이트 정상 서비스 + 전 기기 운영 재개)를 적용했습니다.',
        meta: { mode: 'normal', siteOk: siteRes.ok, suspended: false, source: 'telegram' },
        createdAt: now,
      });

      if (!siteRes.ok) {
        await sendTelegramReply(
          token,
          senderChatId,
          `⚠️ <b>일반 모드 부분 적용</b>\n` +
            `• 뽑기판: 🟢 <b>전 기기 운영 재개 적용 완료</b>\n` +
            `• 메인 사이트 전환 실패: <code>${siteRes.message}</code>`,
          replyToId
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramReply(
        token,
        senderChatId,
        `🟢 <b>일반 모드 전환 완료!</b>\n` +
          `• <code>win.silverruler.xyz</code>: <b>정상 서비스</b> 복귀\n` +
          `• 뽑기판 (4000/4100): 🟢 <b>전 기기 운영 재개</b> 완료\n\n` +
          `<i>💡 다시 점검으로 전환하려면 <b>개발 모드</b>라고 입력하세요.</i>`,
        replyToId
      );
      return NextResponse.json({ ok: true });
    }

    // [개별 X번 기기 운영 중단 / 재개]
    if (singleOpsSlotNum !== null && singleOpsAction) {
      const targetIdx = singleOpsSlotNum - 1;
      const targetLabel = getMachineLabel(targetIdx);
      const isSuspending = singleOpsAction === '중단';
      const updatedOps = await setSingleMachineSuspended(db, targetIdx, isSuspending, 'telegram');
      await recordGachaLog(db, {
        type: 'admin_ops',
        member: '관리자(텔레그램)',
        message: isSuspending
          ? `🛑 운영자(텔레그램)가 [${singleOpsSlotNum}번 뽑기판] ${targetLabel} 운영을 중단(점검중)했습니다.`
          : `🟢 운영자(텔레그램)가 [${singleOpsSlotNum}번 뽑기판] ${targetLabel} 운영을 재개했습니다.`,
        meta: { machineIndex: targetIdx, machineLabel: targetLabel, suspended: isSuspending, source: 'telegram' },
        createdAt: now,
      });
      const suspNums = updatedOps.suspendedMachines.map((i) => `${i + 1}번`).join(', ') || '없음';
      await sendTelegramReply(
        token,
        senderChatId,
        isSuspending
          ? `🛑 <b>${singleOpsSlotNum}번 기기(${targetLabel}) 운영 중단 완료!</b>\n` +
              `• 해당 기기만 점검중 상태로 전환되며, 다른 뽑기판은 정상 운영됩니다.\n` +
              `• 현재 개별 중단 기기: <b>${suspNums}</b>\n` +
              `• 해제하려면 <b>${singleOpsSlotNum}번 기기 운영 재개</b>라고 입력하세요.`
          : `🟢 <b>${singleOpsSlotNum}번 기기(${targetLabel}) 운영 재개 완료!</b>\n` +
              `• 현재 개별 중단 기기: <b>${suspNums}</b>` +
              (updatedOps.suspended ? `\n⚠️ <i>참고: 현재 전 기기 운영 중단이 켜져 있어 전체 해제 전까지 점검중으로 표시됩니다.</i>` : ''),
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
        message: `🧹 운영자(텔레그램)가 전 기기(1~${GACHA_TOTAL_SLOTS}번)의 상품을 모두 제거했습니다.`,
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
      const suspCount = machineOps.suspendedMachines?.length || 0;
      const suspListText = suspCount > 0 ? ` (개별 중단: ${machineOps.suspendedMachines.map((i) => `${i + 1}번`).join(', ')})` : '';
      const opsBadge = machineOps.suspended
        ? '🛑 전 기기 점검중 (운영 중단)'
        : suspCount > 0
        ? `🟡 일부 기기 점검중${suspListText}`
        : '🟢 정상 운영 중';
      const siteMode = getWinSiteMode();
      const siteBadge =
        siteMode === 'dev'
          ? '🛠️ 개발 모드 (점검중 페이지)'
          : siteMode === 'normal'
          ? '🟢 일반 모드 (정상 서비스)'
          : '❓ 확인 불가';
      const presence = getActivePresenceSummary();
      await sendTelegramReply(
        token,
        senderChatId,
        `🎰 <b>개별 UFO 뽑기판 현황 (${totalStock}/${GACHA_TOTAL_SLOTS}개)</b>\n` +
          `• 메인 사이트(win): <b>${siteBadge}</b>\n` +
          `• 뽑기판 상태: <b>${opsBadge}</b>\n` +
          `• 실시간 동접: <b>${presence.totalActive}명</b> (뽑기방 ${presence.byArea.gacha} · 식사배틀 ${presence.byArea.main} · 점검 ${presence.byArea.maintenance})\n\n` +
          `${formatMachineStatusList(machines)}\n\n` +
          `<i>💡 명령어: "개발 모드", "일반 모드", "동접", "1번 리필/재정렬", "전체 유저 1티켓 지급"</i>`,
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
