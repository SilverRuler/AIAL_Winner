import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GachaBoxItem, GachaWinRecord } from '@/types/gacha';
import {
  GACHA_PHYSICS,
  GACHA_TOTAL_SLOTS,
  getBoxRewardAmount,
  getMachineDocId,
  getMachineLabel,
  isBoxAtInitialPose,
  normalizeMachineIndex,
} from '@/constants/gacha';
import {
  getAllMachineStates,
  getAllMemberTicketBalances,
  getGachaMachineOps,
  getOrInitMachineState,
  getTelegramConfig,
  recordGachaLog,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';
import { getClientIp, normalizeIp } from '@/lib/ip';

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeQuat(q: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Array.isArray(q) || q.length !== 4) return fallback;
  const nums = q.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const len = Math.hypot(nums[0], nums[1], nums[2], nums[3]);
  if (len < 1e-6) return fallback;
  return [nums[0] / len, nums[1] / len, nums[2] / len, nums[3] / len];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { turnId, member, updatedItems, wonItemIds, machineIndex: rawMachineIndex } = body || {};

    if (!turnId || !member) {
      return NextResponse.json(
        { success: false, message: 'turnId와 member 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    const machineIndex = normalizeMachineIndex(rawMachineIndex, 0);
    const docId = getMachineDocId(machineIndex);
    const machineLabel = getMachineLabel(machineIndex);

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const col = db.collection('gacha_machine');
    const [machineOps, rawMachine] = await Promise.all([
      getGachaMachineOps(db),
      col.findOne({ _id: docId as any }) as Promise<any>,
    ]);

    if (machineOps.suspended || (machineOps.suspendedMachines || []).includes(machineIndex)) {
      if (rawMachine?.lock?.active) {
        await col.updateOne(
          { _id: docId as any },
          {
            $set: {
              lock: {
                active: false,
                member: null,
                turnId: null,
                startedAt: null,
                expiresAt: null,
              },
              updatedAt: Date.now(),
            },
          }
        );
      }
      return NextResponse.json(
        {
          success: false,
          suspended: true,
          serverNow: Date.now(),
          message: '현재 전 기기 운영 중단(점검중) 상태라 플레이 결과를 반영할 수 없습니다.',
        },
        { status: 503 }
      );
    }

    if (!rawMachine) {
      const fresh = await getOrInitMachineState(db, machineIndex);
      return NextResponse.json({
        success: false,
        message: '뽑기 기계 상태를 찾을 수 없어 초기화되었습니다.',
        machine: sanitizeMachineForClient(fresh),
      }, { status: 404 });
    }

    const now = Date.now();
    const lock = rawMachine.lock;
    const isSameTurn = lock?.turnId === turnId && lock?.member === member;
    const withinGrace = lock?.expiresAt ? now <= lock.expiresAt + 20000 : true;

    if (!isSameTurn || !withinGrace) {
      return NextResponse.json(
        { success: false, message: '유효하지 않거나 만료된 뽑기 턴입니다.' },
        { status: 409 }
      );
    }

    const currentItems: GachaBoxItem[] = Array.isArray(rawMachine.items) ? rawMachine.items : [];
    const wonSet = new Set<string>(Array.isArray(wonItemIds) ? wonItemIds.map(String) : []);
    const updatedMap = new Map<string, { position: unknown; quaternion: unknown; isInitialState?: unknown }>();
    if (Array.isArray(updatedItems)) {
      for (const it of updatedItems) {
        if (it?.id) {
          updatedMap.set(String(it.id), it);
        }
      }
    }

    const remainingItems: GachaBoxItem[] = [];
    const wonBoxes: GachaBoxItem[] = [];

    for (const orig of currentItems) {
      const upd = updatedMap.get(orig.id);
      const nextPos: [number, number, number] = upd && Array.isArray(upd.position) && upd.position.length === 3
        ? [
            clampNumber(upd.position[0], -GACHA_PHYSICS.CABINET_HALF_X, GACHA_PHYSICS.CABINET_HALF_X, orig.position[0]),
            clampNumber(upd.position[1], -2.0, 2.8, orig.position[1]),
            clampNumber(upd.position[2], -GACHA_PHYSICS.CABINET_HALF_Z, GACHA_PHYSICS.CABINET_HALF_Z, orig.position[2]),
          ]
        : orig.position;

      const isWon = wonSet.has(orig.id) || nextPos[1] < GACHA_PHYSICS.DROP_Y_THRESHOLD;
      if (isWon) {
        wonBoxes.push(orig);
      } else {
        const nextQuat = upd ? normalizeQuat(upd.quaternion, orig.quaternion) : orig.quaternion;
        const posMoved =
          Math.hypot(nextPos[0] - orig.position[0], nextPos[2] - orig.position[2]) > 0.025 ||
          Math.abs(nextPos[1] - orig.position[1]) > 0.04;
        const quatDot = Math.abs(
          nextQuat[0] * orig.quaternion[0] +
            nextQuat[1] * orig.quaternion[1] +
            nextQuat[2] * orig.quaternion[2] +
            nextQuat[3] * orig.quaternion[3]
        );
        const rotMoved = quatDot < 0.999;
        const prevInitial = isBoxAtInitialPose(orig);
        const clientInitial = typeof upd?.isInitialState === 'boolean' ? upd.isInitialState : true;
        const nextInitial = prevInitial && clientInitial && !posMoved && !rotMoved;

        remainingItems.push({
          ...orig,
          position: nextPos,
          quaternion: nextQuat,
          isInitialState: nextInitial,
        });
      }
    }

    // 당첨 처리 (자동 리필 없음: 운영자가 '뽑기판 리필' 버튼으로 직접 리필)
    const wonRecords: GachaWinRecord[] = [];
    for (let i = 0; i < wonBoxes.length; i++) {
      const won = wonBoxes[i];
      const rewardAmount = getBoxRewardAmount(won.slotIndex);
      const winRecord: GachaWinRecord = {
        id: `gwin_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        member,
        boxId: won.id,
        boxLabel: won.label,
        colorTheme: won.colorTheme,
        rewardType: won.rewardType || 'SOL',
        rewardAmount,
        unboxed: true,
        claimStatus: 'unclaimed',
        notified: false,
        createdAt: now + i,
      };
      wonRecords.push(winRecord);
    }

    // 실제 플레이 횟수(+1) 및 당첨 수 기록
    const ticketInc: Record<string, number> = { totalPlayed: 1 };
    if (wonRecords.length > 0) {
      ticketInc.totalWins = wonRecords.length;
      await db.collection('gacha_wins').insertMany(wonRecords.map((r) => ({ ...r, _id: r.id as any })));
    }

    // 연속 뽑기 세션 잔여 횟수 계산
    const totalPlays = Math.max(1, Number(lock.totalPlays) || 1);
    const prevRemaining = Math.max(1, Number(lock.remainingPlays) || 1);
    const prevShotIndex = Math.max(1, Number(lock.shotIndex) || 1);
    const paidTickets = Math.max(1, Number(lock.paidTickets) || totalPlays);
    const bonusPlays = Math.max(0, Number(lock.bonusPlays) || 0);
    const nextRemaining = Math.max(0, prevRemaining - 1);

    // 남은 상품이 있고 잔여 회차가 남아있으면 락 유지한 채 다음 연속 회차로 이어감
    const sessionContinue = nextRemaining > 0 && remainingItems.length > 0;
    const nextShotIndex = prevShotIndex + 1;

    // 도중에 모든 상품이 완판되어 연속 뽑기가 조기 종료된 경우 미사용 유료 티켓 자동 환불
    let refundedTickets = 0;
    if (nextRemaining > 0 && remainingItems.length === 0) {
      const usedShots = totalPlays - nextRemaining;
      refundedTickets = Math.max(0, paidTickets - usedShots);
      if (refundedTickets > 0) {
        ticketInc.tickets = refundedTickets;
      }
    }

    const updatedTicketDoc = (await db.collection('gacha_tickets').findOneAndUpdate(
      { _id: member as any },
      { $inc: ticketInc, $set: { updatedAt: now } },
      { returnDocument: 'after' }
    )) as any;
    const afterTickets =
      typeof updatedTicketDoc?.tickets === 'number' ? Math.max(0, updatedTicketDoc.tickets) : null;

    // slotIndex 순 정렬
    remainingItems.sort((a, b) => a.slotIndex - b.slotIndex);

    const progressTag = totalPlays > 1 ? ` (${prevShotIndex}/${totalPlays}회)` : '';
    const refundNote =
      refundedTickets > 0
        ? ` · 미사용 뽑기권 ${refundedTickets}장 자동 환불${afterTickets !== null ? ` (잔여 ${afterTickets}장)` : ''}`
        : '';
    const actionSummary =
      wonRecords.length > 0
        ? `🎉 [${machineIndex + 1}번 뽑기판] ${member}님이 ${wonRecords.map((w) => w.boxLabel).join(', ')} 뽑기에 성공! (${
            remainingItems.length > 0 ? `남은 재고 ${remainingItems.length}개` : '품절 · 리필 대기'
          }${refundNote})`
        : `[${machineIndex + 1}번 ${machineLabel}] ${member}님이 크레인을 조작하여 위치를 움직였습니다.${progressTag}`;

    const nextLock = sessionContinue
      ? {
          active: true,
          member,
          turnId,
          startedAt: lock.startedAt || now,
          expiresAt: now + GACHA_PHYSICS.LOCK_TTL_MS,
          totalPlays,
          remainingPlays: nextRemaining,
          shotIndex: nextShotIndex,
          paidTickets,
          bonusPlays,
        }
      : {
          active: false,
          member: null,
          turnId: null,
          startedAt: null,
          expiresAt: null,
        };

    const nextMachine = await col.findOneAndUpdate(
      { _id: docId as any },
      {
        $set: {
          items: remainingItems,
          lock: nextLock,
          lastPlayedBy: member,
          lastPlayedAt: now,
          lastActionSummary: actionSummary,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || rawIp || '';
    await recordGachaLog(db, {
      type: wonRecords.length > 0 ? 'win' : 'move',
      member,
      message: actionSummary,
      meta: {
        turnId,
        machineIndex,
        machineLabel,
        shotIndex: prevShotIndex,
        totalPlays,
        wonLabels: wonRecords.map((w) => w.boxLabel),
        wonCount: wonRecords.length,
        remainingStock: remainingItems.length,
        refundedTickets,
        ip: clientIp,
      },
      createdAt: now,
    });

    // 누군가가 뽑기에 성공하면 관리자에게 텔레그램 즉시 알람 발송 (전체 6개 뽑기판 합산 재고 포함)
    if (wonRecords.length > 0) {
      try {
        const allMachinesAfter = await getAllMachineStates(db);
        const totalRemainingAcrossAll = allMachinesAfter.reduce(
          (sum, m) => sum + (Array.isArray(m.items) ? m.items.length : 0),
          0
        );
        const { token: teleToken, chatId: teleChatId } = getTelegramConfig();
        const kstDate = new Date(now + 9 * 3600 * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19);
        const wonLabels = wonRecords.map((w) => w.boxLabel).join(', ');
        const totalRewardSol = Number(
          wonRecords.reduce((sum, w) => sum + (w.rewardAmount || 0.01), 0).toFixed(4)
        );
        const stockLine =
          totalRemainingAcrossAll === 0
            ? `📦 <b>전체 ${GACHA_TOTAL_SLOTS}개 뽑기판 재고가 0개입니다! (전량 완판 - 리필 필요)</b>`
            : `📦 <b>[${machineIndex + 1}번 뽑기판] 품절 · 전체 잔여 재고: ${totalRemainingAcrossAll}/${GACHA_TOTAL_SLOTS}개</b>`;

        const telegramText =
          `🎉 <b>[AIAL Winner] UFO 뽑기 당첨 알림!</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>당첨 멤버:</b> <b>${member}</b>\n` +
          `🎁 <b>획득 상품:</b> [${machineIndex + 1}번 판] ${wonLabels} (${totalRewardSol} SOL)\n` +
          `${stockLine}\n` +
          `⏰ <b>당첨 일시:</b> ${kstDate} (KST)\n` +
          `━━━━━━━━━━━━━━━━━━`;

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
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!teleResp.ok) {
          console.warn('Telegram gacha win alert failed:', await teleResp.text());
        }
      } catch (teleErr) {
        console.error('Telegram gacha win alert error:', teleErr);
      }
    }

    const ticketsByMember = await getAllMemberTicketBalances(db);

    return NextResponse.json({
      success: true,
      serverNow: Date.now(),
      machineIndex,
      wonRecords,
      sessionContinue,
      totalPlays,
      remainingPlays: sessionContinue ? nextRemaining : 0,
      nextShotIndex: sessionContinue ? nextShotIndex : 0,
      bonusPlays,
      refundedTickets,
      machine: sanitizeMachineForClient((nextMachine || rawMachine) as any),
      ticketsByMember,
    });
  } catch (error: any) {
    console.error('Failed to finish gacha turn:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 결과 저장 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
