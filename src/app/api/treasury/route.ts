import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';

export const dynamic = 'force-dynamic';

const MEAL_SOL_PER_WIN = 0.002; // 식사배틀 5WIN = 0.01 SOL (1WIN = 0.002 SOL)
const roundSol = (v: number) => Math.round(v * 1000000) / 1000000;

const OPERATOR_SOL_ADDRESS = '8e3z8Hrqh4T5NRxJVNczqcLKFXsfWtjEuw3zsHrHDUVi';
const BALANCE_CACHE_TTL_MS = 60 * 60 * 1000; // 기본 1시간마다 잔고 자동 업데이트
const FORCE_REFRESH_COOLDOWN_MS = 10 * 1000; // 수동 새로고침 시 10초 쿨다운으로 RPC 과부하 방지
const PRICE_CACHE_TTL_MS = 60 * 1000; // 시세는 현재시점 기준 (1분 단기 보호 캐시)

const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

interface CachedTreasury {
  balanceSol: number;
  balanceUpdatedAt: number;
}

interface CachedPrice {
  solPriceKrw: number;
  priceSource: string;
  priceUpdatedAt: number;
}

const g = globalThis as unknown as {
  __aialTreasuryCache?: CachedTreasury;
  __aialSolPriceCache?: CachedPrice;
};

async function fetchSolanaBalanceSol(address: string): Promise<number | null> {
  for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address],
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const json = await resp.json();
      const lamports = json?.result?.value;
      if (typeof lamports === 'number' && Number.isFinite(lamports)) {
        return lamports / 1e9;
      }
    } catch {
      // try next RPC
    }
  }
  return null;
}

async function fetchCurrentSolPriceKrw(): Promise<{ priceKrw: number; source: string } | null> {
  // 1) Upbit KRW-SOL (국내 원화 시세 기준)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-SOL', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const arr = await resp.json();
      const tradePrice = arr?.[0]?.trade_price;
      if (typeof tradePrice === 'number' && tradePrice > 0) {
        return { priceKrw: tradePrice, source: 'Upbit' };
      }
    }
  } catch {
    // fallback to CoinGecko
  }

  // 2) CoinGecko fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=krw',
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (resp.ok) {
      const json = await resp.json();
      const krw = json?.solana?.krw;
      if (typeof krw === 'number' && krw > 0) {
        return { priceKrw: krw, source: 'CoinGecko' };
      }
    }
  } catch {
    // failed
  }

  return null;
}

export async function GET(request: NextRequest) {
  const now = Date.now();
  const forceRefresh = request.nextUrl.searchParams.get('force') === '1';

  try {
    const db = await getDatabase();
    const col = db ? db.collection('treasury_cache') : null;

    // 1. 운영자 SOL 잔고 (기본 1시간 캐시, 수동 새로고침 ?force=1 시 10초 쿨다운 후 즉시 온체인 재조회)
    let balanceSol: number | null = null;
    let balanceUpdatedAt = 0;
    const effectiveBalanceTtl = forceRefresh ? FORCE_REFRESH_COOLDOWN_MS : BALANCE_CACHE_TTL_MS;

    if (
      g.__aialTreasuryCache &&
      now - g.__aialTreasuryCache.balanceUpdatedAt < effectiveBalanceTtl
    ) {
      balanceSol = g.__aialTreasuryCache.balanceSol;
      balanceUpdatedAt = g.__aialTreasuryCache.balanceUpdatedAt;
    } else if (col && !forceRefresh) {
      const dbDoc = (await col.findOne({ _id: 'operator_sol_balance' as any })) as any;
      if (
        dbDoc &&
        typeof dbDoc.balanceSol === 'number' &&
        typeof dbDoc.balanceUpdatedAt === 'number' &&
        now - dbDoc.balanceUpdatedAt < effectiveBalanceTtl
      ) {
        const cachedBal: number = dbDoc.balanceSol;
        const cachedAt: number = dbDoc.balanceUpdatedAt;
        balanceSol = cachedBal;
        balanceUpdatedAt = cachedAt;
        g.__aialTreasuryCache = { balanceSol: cachedBal, balanceUpdatedAt: cachedAt };
      }
    }

    if (balanceSol === null) {
      const freshBalance = await fetchSolanaBalanceSol(OPERATOR_SOL_ADDRESS);
      if (freshBalance !== null) {
        balanceSol = freshBalance;
        balanceUpdatedAt = now;
        g.__aialTreasuryCache = { balanceSol, balanceUpdatedAt };
        if (col) {
          await col.updateOne(
            { _id: 'operator_sol_balance' as any },
            {
              $set: {
                address: OPERATOR_SOL_ADDRESS,
                balanceSol,
                balanceUpdatedAt,
              },
            },
            { upsert: true }
          );
        }
      } else {
        // RPC 일시 장애 시 마지막 저장값 fallback
        if (g.__aialTreasuryCache) {
          balanceSol = g.__aialTreasuryCache.balanceSol;
          balanceUpdatedAt = g.__aialTreasuryCache.balanceUpdatedAt;
        } else if (col) {
          const fallbackDoc = (await col.findOne({ _id: 'operator_sol_balance' as any })) as any;
          if (fallbackDoc && typeof fallbackDoc.balanceSol === 'number') {
            balanceSol = fallbackDoc.balanceSol;
            balanceUpdatedAt = Number(fallbackDoc.balanceUpdatedAt) || now;
          }
        }
      }
    }

    // 2. 현재 시점 기준 솔라나 원화 시세 (실시간, 1분 보호 캐시)
    let solPriceKrw: number | null = null;
    let priceSource = 'Upbit';
    let priceUpdatedAt = now;

    if (
      g.__aialSolPriceCache &&
      now - g.__aialSolPriceCache.priceUpdatedAt < PRICE_CACHE_TTL_MS
    ) {
      solPriceKrw = g.__aialSolPriceCache.solPriceKrw;
      priceSource = g.__aialSolPriceCache.priceSource;
      priceUpdatedAt = g.__aialSolPriceCache.priceUpdatedAt;
    } else {
      const freshPrice = await fetchCurrentSolPriceKrw();
      if (freshPrice) {
        solPriceKrw = freshPrice.priceKrw;
        priceSource = freshPrice.source;
        priceUpdatedAt = now;
        g.__aialSolPriceCache = { solPriceKrw, priceSource, priceUpdatedAt };
        if (col) {
          await col.updateOne(
            { _id: 'sol_price_cache' as any },
            {
              $set: {
                solPriceKrw,
                priceSource,
                priceUpdatedAt,
              },
            },
            { upsert: true }
          );
        }
      } else if (g.__aialSolPriceCache) {
        solPriceKrw = g.__aialSolPriceCache.solPriceKrw;
        priceSource = g.__aialSolPriceCache.priceSource;
        priceUpdatedAt = g.__aialSolPriceCache.priceUpdatedAt;
      } else if (col) {
        const fallbackPrice = (await col.findOne({ _id: 'sol_price_cache' as any })) as any;
        if (fallbackPrice && typeof fallbackPrice.solPriceKrw === 'number') {
          solPriceKrw = fallbackPrice.solPriceKrw;
          priceSource = fallbackPrice.priceSource || 'Upbit';
          priceUpdatedAt = Number(fallbackPrice.priceUpdatedAt) || now;
        }
      }
    }

    // 3. 식사배틀 + 뽑기 전체 신청 가능 리워드 집계 (실시간 DB 조회)
    let mealAvailableWinsTotal = 0;
    let mealClaimable5WinsTotal = 0;
    let mealPendingSol = 0;
    let gachaPendingSol = 0;

    if (db) {
      const [mealWinDocs, mealRewardApps, winExchanges, gachaWins, gachaApps, gachaSolExchanges] =
        await Promise.all([
          db.collection('meals').find({ isWinner: true }, { projection: { member: 1 } }).toArray(),
          db
            .collection('reward_applications')
            .find({ status: { $ne: 'rejected' } }, { projection: { member: 1, requestedWins: 1 } })
            .toArray(),
          db
            .collection('gacha_win_exchanges')
            .find({}, { projection: { member: 1, winsUsed: 1 } })
            .toArray(),
          db
            .collection('gacha_wins')
            .find({}, { projection: { member: 1, rewardAmount: 1 } })
            .toArray(),
          db
            .collection('gacha_reward_applications')
            .find({ status: { $ne: 'rejected' } }, { projection: { member: 1, rewardAmount: 1, requestedWins: 1 } })
            .toArray(),
          db
            .collection('gacha_sol_exchanges')
            .find({}, { projection: { member: 1, solUsed: 1 } })
            .toArray(),
        ]);

      const mealWinsByMember: Record<string, number> = {};
      for (const d of mealWinDocs as any[]) {
        if (d.member) mealWinsByMember[d.member] = (mealWinsByMember[d.member] || 0) + 1;
      }
      const mealUsedByMember: Record<string, number> = {};
      for (const a of mealRewardApps as any[]) {
        if (a.member) {
          mealUsedByMember[a.member] =
            (mealUsedByMember[a.member] || 0) + (Number(a.requestedWins) || 0);
        }
      }
      const mealExByMember: Record<string, number> = {};
      for (const ex of winExchanges as any[]) {
        if (ex.member) {
          mealExByMember[ex.member] =
            (mealExByMember[ex.member] || 0) + (Number(ex.winsUsed) || 1);
        }
      }

      const gachaEarnedByMember: Record<string, number> = {};
      for (const w of gachaWins as any[]) {
        if (!w?.member) continue;
        const amt = typeof w.rewardAmount === 'number' ? w.rewardAmount : 0.01;
        gachaEarnedByMember[w.member] = roundSol((gachaEarnedByMember[w.member] || 0) + amt);
      }
      const gachaUsedByMember: Record<string, number> = {};
      for (const app of gachaApps as any[]) {
        if (!app?.member) continue;
        const appSol =
          typeof app.rewardAmount === 'number'
            ? app.rewardAmount
            : roundSol((Number(app.requestedWins) || 0) * 0.01);
        gachaUsedByMember[app.member] = roundSol((gachaUsedByMember[app.member] || 0) + appSol);
      }
      for (const ex of gachaSolExchanges as any[]) {
        if (!ex?.member) continue;
        gachaUsedByMember[ex.member] = roundSol(
          (gachaUsedByMember[ex.member] || 0) + (Number(ex.solUsed) || 0)
        );
      }

      const memberNames = new Set<string>(MEMBERS.map((m) => m.name));
      Object.keys(mealWinsByMember).forEach((k) => memberNames.add(k));
      Object.keys(gachaEarnedByMember).forEach((k) => memberNames.add(k));

      for (const name of memberNames) {
        const availMealWins = Math.max(
          0,
          (mealWinsByMember[name] || 0) -
            (mealUsedByMember[name] || 0) -
            (mealExByMember[name] || 0)
        );
        mealAvailableWinsTotal += availMealWins;
        if (availMealWins >= 5) {
          mealClaimable5WinsTotal += Math.floor(availMealWins / 5) * 5;
        }
        const availGachaSol = Math.max(
          0,
          roundSol((gachaEarnedByMember[name] || 0) - (gachaUsedByMember[name] || 0))
        );
        gachaPendingSol = roundSol(gachaPendingSol + availGachaSol);
      }
      mealPendingSol = roundSol(mealAvailableWinsTotal * MEAL_SOL_PER_WIN);
    }

    const totalClaimableSol = roundSol(mealPendingSol + gachaPendingSol);
    const estimatedRemainingSol =
      typeof balanceSol === 'number' ? roundSol(balanceSol - totalClaimableSol) : null;
    const estimatedRemainingKrw =
      typeof estimatedRemainingSol === 'number' && typeof solPriceKrw === 'number'
        ? Math.round(estimatedRemainingSol * solPriceKrw)
        : null;

    const price001SolKrw =
      typeof solPriceKrw === 'number' ? Number((solPriceKrw * 0.01).toFixed(1)) : null;
    const balanceKrw =
      typeof balanceSol === 'number' && typeof solPriceKrw === 'number'
        ? Math.round(balanceSol * solPriceKrw)
        : null;

    return NextResponse.json({
      success: true,
      address: OPERATOR_SOL_ADDRESS,
      balanceSol,
      balanceKrw,
      balanceUpdatedAt,
      nextBalanceUpdateAt: balanceUpdatedAt ? balanceUpdatedAt + BALANCE_CACHE_TTL_MS : null,
      solPriceKrw,
      price001SolKrw,
      priceSource,
      priceUpdatedAt,
      rewardLiability: {
        mealAvailableWinsTotal,
        mealClaimable5WinsTotal,
        mealSolPerWin: MEAL_SOL_PER_WIN,
        mealPendingSol,
        gachaPendingSol,
        totalClaimableSol,
        estimatedRemainingSol,
        estimatedRemainingKrw,
      },
    });
  } catch (error: any) {
    console.error('Failed to fetch operator treasury balance:', error);
    return NextResponse.json(
      {
        success: false,
        message: '운영자 잔고 정보를 불러오지 못했습니다.',
        error: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
