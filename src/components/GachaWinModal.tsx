'use client';

import React, { useEffect } from 'react';
import { X, Trophy, Coins, Sparkles } from 'lucide-react';
import { fireSafeConfetti, clearSafeConfetti } from '@/lib/confetti';
import { GachaWinRecord } from '@/types/gacha';

interface GachaWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  winRecord: GachaWinRecord | null;
  refundedTickets?: number;
}

export const GachaWinModal: React.FC<GachaWinModalProps> = ({
  isOpen,
  onClose,
  winRecord,
  refundedTickets = 0,
}) => {
  // 당첨 팝업이 열리자마자 폭죽 효과 발사
  useEffect(() => {
    if (!isOpen || !winRecord) return;

    const fire = (particleRatio: number, opts: Record<string, unknown>) => {
      fireSafeConfetti({
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#fbbf24', '#22d3ee', '#10b981', '#a855f7', '#fb7185'],
        ...opts,
        particleCount: Math.floor(140 * particleRatio),
      });
    };

    fire(0.3, { spread: 40, startVelocity: 50 });
    fire(0.25, { spread: 70, startVelocity: 40 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.95 });

    const t1 = setTimeout(() => {
      fireSafeConfetti({
        particleCount: 65,
        angle: 60,
        spread: 60,
        origin: { x: 0.15, y: 0.65 },
        colors: ['#f59e0b', '#22d3ee', '#a855f7', '#fb7185'],
      });
      fireSafeConfetti({
        particleCount: 65,
        angle: 120,
        spread: 60,
        origin: { x: 0.85, y: 0.65 },
        colors: ['#f59e0b', '#22d3ee', '#10b981', '#fbbf24'],
      });
    }, 260);

    return () => {
      clearTimeout(t1);
      clearSafeConfetti();
    };
  }, [isOpen, winRecord]);

  if (!isOpen || !winRecord) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-amber-400/60 w-full max-w-sm rounded-3xl shadow-2xl shadow-amber-500/20 overflow-hidden text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="닫기"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pt-7 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-2xl shadow-amber-500/30 animate-bounce">
            <Trophy className="w-10 h-10 text-slate-950" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[11px] font-black">
              <Sparkles className="w-3 h-3" />
              <span>UFO 뽑기 당첨!</span>
            </div>

            <h2 className="text-lg sm:text-xl font-black text-white leading-snug">
              <span className="text-amber-300">{winRecord.boxLabel}</span>을 뽑았습니다!
              <br />
              축하합니다! 🎉
            </h2>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-cyan-300">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {winRecord.member}님 · +{winRecord.rewardAmount} SOL 적립
              </span>
            </div>

            {refundedTickets > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs font-bold text-emerald-300">
                🎟️ 연속 뽑기 조기 당첨으로 남은 뽑기권 {refundedTickets}장이 정상 반환되었습니다!
              </div>
            )}

            <p className="text-[11px] text-slate-400 pt-1">
              리워드는 상단 <strong className="text-amber-300">[명예의 전당]</strong>에서 원하실 때 신청할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/25 transition-all active:scale-95 cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
