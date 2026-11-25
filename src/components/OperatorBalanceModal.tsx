'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Wallet,
  Coins,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface OperatorBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TreasuryData {
  address: string;
  balanceSol: number | null;
  balanceKrw: number | null;
  balanceUpdatedAt: number;
  nextBalanceUpdateAt: number | null;
  solPriceKrw: number | null;
  price001SolKrw: number | null;
  priceSource: string;
  priceUpdatedAt: number;
}

function formatKstTime(ts?: number | null): string {
  if (!ts) return '-';
  const kst = new Date(ts + 9 * 3600 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} KST`;
}

export const OperatorBalanceModal: React.FC<OperatorBalanceModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTreasury = useCallback(async (force = false) => {
    setIsLoading(true);
    setError('');
    try {
      const url = force
        ? `/api/treasury?force=1&_t=${Date.now()}`
        : `/api/treasury?_t=${Date.now()}`;
      const resp = await fetch(url, { cache: 'no-store' });
      const json = await resp.json();
      if (resp.ok && json.success) {
        setData(json);
      } else {
        setError(json.message || '잔고 정보를 불러오지 못했습니다.');
      }
    } catch {
      setError('네트워크 오류로 잔고 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTreasury(false);
    }
  }, [isOpen, fetchTreasury]);

  if (!isOpen) return null;

  const handleCopyAddress = async () => {
    if (!data?.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-emerald-500/40 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-b border-emerald-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">운영자 리워드 잔고</h2>
              <p className="text-[11px] text-slate-400">Solana(SOL) 지갑 실시간 현황</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fetchTreasury(true)}
              disabled={isLoading}
              className="p-2 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="온체인 잔고 즉시 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto space-y-4">
          {isLoading && !data ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              <span className="text-xs font-semibold">솔라나 잔고 및 시세를 조회하는 중...</span>
            </div>
          ) : error && !data ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2">
              <p className="text-xs text-rose-300 font-bold">{error}</p>
              <button
                type="button"
                onClick={() => fetchTreasury(true)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <>
              {/* 1. 운영자 솔라나 잔고 카드 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-slate-950 to-slate-950 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    운영자 지갑 잔고
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-semibold">
                    1시간마다 업데이트
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                      {typeof data?.balanceSol === 'number'
                        ? data.balanceSol.toFixed(6)
                        : '-'}
                    </span>
                    <span className="text-sm font-black text-emerald-400">SOL</span>
                  </div>
                  {typeof data?.balanceKrw === 'number' && (
                    <p className="text-xs text-slate-300 font-semibold mt-1">
                      원화 환산 약{' '}
                      <strong className="text-emerald-300 font-mono">
                        {data.balanceKrw.toLocaleString()}원
                      </strong>
                    </p>
                  )}
                </div>

                {/* 지갑 주소 + 복사 + Solscan */}
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[11px] font-mono text-slate-300 truncate select-all">
                      {data?.address || '8e3z8Hrqh4T5NRxJVNczqcLKFXsfWtjEuw3zsHrHDUVi'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="지갑 주소 복사"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={`https://solscan.io/account/${
                          data?.address || '8e3z8Hrqh4T5NRxJVNczqcLKFXsfWtjEuw3zsHrHDUVi'
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 transition-colors"
                        title="Solscan에서 확인"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      잔고 기준: {formatKstTime(data?.balanceUpdatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. 현재 시점 기준 솔라나 가격 & 0.01 SOL 당 원화 가격 */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    현재 시점 기준 솔라나(SOL) 시세
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {data?.priceSource || 'Upbit'} 기준
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-semibold">1 SOL 현재가</div>
                    <div className="text-sm sm:text-base font-black text-white font-mono mt-0.5">
                      {typeof data?.solPriceKrw === 'number'
                        ? `${Math.round(data.solPriceKrw).toLocaleString()}원`
                        : '-'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/35">
                    <div className="text-[10px] text-amber-300 font-bold">0.01 SOL 당 원화</div>
                    <div className="text-sm sm:text-base font-black text-amber-200 font-mono mt-0.5">
                      {typeof data?.price001SolKrw === 'number'
                        ? `${data.price001SolKrw.toLocaleString()}원`
                        : '-'}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 text-right">
                  시세 조회: {formatKstTime(data?.priceUpdatedAt)}
                </div>
              </div>

              {/* 3. 리워드 지급 안내 문구 */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5 text-xs text-slate-200 leading-relaxed font-medium">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-amber-200">
                      리워드는 선착순(신청 기준)으로 지급합니다.
                    </strong>
                    <br />
                    <span className="text-slate-300">
                      잔고가 0에 달할 시 리워드 지급이 지연될 수 있습니다.
                    </span>
                  </span>
                </p>
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
