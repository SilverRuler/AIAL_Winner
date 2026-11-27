import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import {
  getAllMachineStates,
  getAllMemberTicketBalances,
  getGachaMachineOps,
  getNextScheduledResetInfo,
  isAdminAuthorized,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';
import {
  buildGachaPageLabel,
  getActivePresenceCount,
  recordPresence,
} from '@/lib/presence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const [machines, ticketsByMember, allWinsRaw, validAppsRaw, solExchangesRaw, mealWinDocs, mealRewardApps, winExchanges, machineOps, recentLogsRaw, totalLogCount] =
      await Promise.all([
        getAllMachineStates(db),
        getAllMemberTicketBalances(db),
        db
          .collection('gacha_wins')
          .find({})
          .sort({ createdAt: -1 })
          .toArray(),
        db
          .collection('gacha_reward_applications')
          .find({ status: { $ne: 'rejected' } })
          .toArray(),
        db
          .collection('gacha_sol_exchanges')
          .find({}, { projection: { member: 1, solUsed: 1 } })
          .toArray(),
        db
          .collection('meals')
          .find({ isWinner: true }, { projection: { member: 1 } })
          .toArray(),
        db
          .collection('reward_applications')
          .find({ status: { $ne: 'rejected' } }, { projection: { member: 1, requestedWins: 1 } })
          .toArray(),
        db
          .collection('gacha_win_exchanges')
          .find({}, { projection: { member: 1, winsUsed: 1 } })
          .toArray(),
        getGachaMachineOps(db),
        db
          .collection('gacha_logs')
          .find(
            {},
            {
              projection: {
                id: 1,
                type: 1,
                member: 1,
                message: 1,
                createdAt: 1,
                'meta.machineIndex': 1,
              },
            }
          )
          .sort({ createdAt: -1, _id: -1 })
          .limit(10)
          .toArray(),
        db.collection('gacha_logs').countDocuments({}),
      ]);

    const formatWin = (doc: any) => ({
      id: doc.id || doc._id.toString(),
      member: doc.member,
      boxId: doc.boxId,
      boxLabel: doc.boxLabel,
      colorTheme: doc.colorTheme,
      rewardType: doc.rewardType || 'SOL',
      rewardAmount: typeof doc.rewardAmount === 'number' ? doc.rewardAmount : 0.01,
      unboxed: Boolean(doc.unboxed),
      claimStatus: doc.claimStatus || 'unclaimed',
      walletAddress: doc.walletAddress || '',
      memo: doc.memo || '',
      createdAt: doc.createdAt || 0,
      claimedAt: doc.claimedAt,
    });

    // 멤버별 총 뽑기 성공 수 / 기신청 수 / 남은 신청 가능 수 집계
    const actualWinsByMember: Record<string, number> = {};
    const lastWinDateByMember: Record<string, string> = {};
    for (const doc of allWinsRaw as any[]) {
      const m = doc.member;
      if (!m) continue;
      actualWinsByMember[m] = (actualWinsByMember[m] || 0) + 1;
      if (!lastWinDateByMember[m] && doc.createdAt) {
        lastWinDateByMember[m] = new Date(doc.createdAt + 9 * 3600 * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 16);
      }
    }

    const roundSol = (v: number) => Math.round(v * 10000) / 10000;
    const usedWinsByMember: Record<string, number> = {};
    const usedGachaSolByMember: Record<string, number> = {};
    for (const app of validAppsRaw as any[]) {
      if (app.member) {
        usedWinsByMember[app.member] =
          (usedWinsByMember[app.member] || 0) + (Number(app.requestedWins) || 0);
        const appSol =
          typeof app.rewardAmount === 'number'
            ? app.rewardAmount
            : roundSol((Number(app.requestedWins) || 0) * 0.01);
        usedGachaSolByMember[app.member] = roundSol(
          (usedGachaSolByMember[app.member] || 0) + appSol
        );
      }
    }
    for (const ex of solExchangesRaw as any[]) {
      if (ex.member) {
        usedGachaSolByMember[ex.member] = roundSol(
          (usedGachaSolByMember[ex.member] || 0) + (Number(ex.solUsed) || 0)
        );
      }
    }

    // 멤버별 총 획득 SOL 및 남은 신청 가능 SOL 집계
    const totalGachaSolByMember: Record<string, number> = {};
    for (const doc of allWinsRaw as any[]) {
      if (!doc?.member) continue;
      const amt = typeof doc.rewardAmount === 'number' ? doc.rewardAmount : 0.01;
      totalGachaSolByMember[doc.member] = roundSol(
        (totalGachaSolByMember[doc.member] || 0) + amt
      );
    }
    const availableGachaSolByMember: Record<string, number> = {};
    for (const m of MEMBERS) {
      const earned = totalGachaSolByMember[m.name] || 0;
      const used = usedGachaSolByMember[m.name] || 0;
      availableGachaSolByMember[m.name] = Math.max(0, roundSol(earned - used));
    }

    const gachaWinStats = MEMBERS.map((m) => {
      const totalWins = actualWinsByMember[m.name] || 0;
      const totalSubmissions = ticketsByMember[m.name]?.totalPlayed || 0;
      const usedWins = usedWinsByMember[m.name] || 0;
      const availableWins = Math.max(0, totalWins - usedWins);
      const winRate =
        totalSubmissions > 0 ? Math.min(100, Math.round((totalWins / totalSubmissions) * 100)) : 0;
      return {
        member: m.name,
        totalSubmissions,
        totalWins,
        usedWins,
        availableWins,
        winRate,
        lastWinDate: lastWinDateByMember[m.name],
      };
    }).sort((a, b) => {
      if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
      return b.totalSubmissions - a.totalSubmissions;
    });

    // 식사배틀 승점 ↔ 뽑기권 교환 현황 집계
    const mealWinsByMember: Record<string, number> = {};
    for (const d of mealWinDocs as any[]) {
      if (d.member) mealWinsByMember[d.member] = (mealWinsByMember[d.member] || 0) + 1;
    }
    const mealRewardUsedByMember: Record<string, number> = {};
    for (const a of mealRewardApps as any[]) {
      if (a.member) {
        mealRewardUsedByMember[a.member] =
          (mealRewardUsedByMember[a.member] || 0) + (Number(a.requestedWins) || 0);
      }
    }
    const exchangedWinsByMember: Record<string, number> = {};
    for (const ex of winExchanges as any[]) {
      if (ex.member) {
        exchangedWinsByMember[ex.member] =
          (exchangedWinsByMember[ex.member] || 0) + (Number(ex.winsUsed) || 1);
      }
    }
    const mealWinSummaryByMember: Record<
      string,
      { actualWins: number; rewardUsedWins: number; exchangedWins: number; availableMealWins: number }
    > = {};
    for (const m of MEMBERS) {
      const actualWins = mealWinsByMember[m.name] || 0;
      const rewardUsedWins = mealRewardUsedByMember[m.name] || 0;
      const exchangedWins = exchangedWinsByMember[m.name] || 0;
      mealWinSummaryByMember[m.name] = {
        actualWins,
        rewardUsedWins,
        exchangedWins,
        availableMealWins: actualWins - rewardUsedWins - exchangedWins,
      };
    }

    const recentWins = allWinsRaw.map(formatWin);
    const unclaimedWins = allWinsRaw
      .filter((d: any) => (d.claimStatus || 'unclaimed') === 'unclaimed')
      .map(formatWin);

    const isAdminReq = isAdminAuthorized(request);
    const sanitizedMachines = machines.map((m) => {
      const sanitized = sanitizeMachineForClient(m);
      if (machineOps.suspended && !isAdminReq) {
        return {
          ...sanitized,
          items: [],
          lock: {
            active: false,
            member: null,
            turnId: null,
            startedAt: null,
            expiresAt: null,
          },
        };
      }
      return sanitized;
    });

    const { searchParams } = new URL(request.url);
    const qMember = (searchParams.get('member') || '').trim();
    const qMachineRaw = searchParams.get('machine');
    const qMachineIdx =
      qMachineRaw !== null && /^\d+$/.test(qMachineRaw) ? Number(qMachineRaw) : undefined;
    const qEngine = (searchParams.get('engine') || '').trim() || 'Gacha';
    const qPlaying = searchParams.get('playing') === '1' && !machineOps.suspended;
    recordPresence(request, {
      area: 'gacha',
      engine: qEngine,
      machineIndex: qMachineIdx,
      member: qMember || undefined,
      isPlaying: qPlaying,
      page: buildGachaPageLabel(qEngine, qMachineIdx, machineOps.suspended),
    });
    const activeUsersCount = getActivePresenceCount();

    const nowMs = Date.now();
    const nextReset = getNextScheduledResetInfo(nowMs);
    const recentLogs = (recentLogsRaw as any[]).map((doc) => ({
      id: doc.id || String(doc._id),
      type: doc.type || 'info',
      member: doc.member || 'SYSTEM',
      message: doc.message || '',
      createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : 0,
      machineIndex:
        typeof doc.meta?.machineIndex === 'number' ? doc.meta.machineIndex : undefined,
    }));

    return NextResponse.json(
      {
        success: true,
        serverNow: nowMs,
        activeUsersCount,
        nextResetAt: nextReset.nextResetAt,
        nextResetLabel: nextReset.nextResetLabel,
        machineOps,
        machine: sanitizedMachines[0],
        machines: sanitizedMachines,
        ticketsByMember,
        unclaimedWins,
        recentWins,
        recentLogs,
        totalLogCount,
        gachaWinStats,
        usedWinsByMember,
        availableGachaSolByMember,
        mealWinSummaryByMember,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to get gacha state:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 상태 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}
