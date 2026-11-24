import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

const OPERATOR_SOL_ADDRESS = '8e3z8Hrqh4T5NRxJVNczqcLKFXsfWtjEuw3zsHrHDUVi';
const BALANCE_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간마다 잔고 업데이트
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

export async function GET() {
  const now = Date.now();

  try {
    const db = await getDatabase();
    const col = db ? db.collection('treasury_cache') : null;

    // 1. 운영자 SOL 잔고 (1시간 캐시)
    let balanceSol: number | null = null;
    let balanceUpdatedAt = 0;

    if (
      g.__aialTreasuryCache &&
      now - g.__aialTreasuryCache.balanceUpdatedAt < BALANCE_CACHE_TTL_MS
    ) {
      balanceSol = g.__aialTreasuryCache.balanceSol;
      balanceUpdatedAt = g.__aialTreasuryCache.balanceUpdatedAt;
    } else if (col) {
      const dbDoc = (await col.findOne({ _id: 'operator_sol_balance' as any })) as any;
      if (
        dbDoc &&
        typeof dbDoc.balanceSol === 'number' &&
        typeof dbDoc.balanceUpdatedAt === 'number' &&
        now - dbDoc.balanceUpdatedAt < BALANCE_CACHE_TTL_MS
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
