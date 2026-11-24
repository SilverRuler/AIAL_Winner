'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Gift,
  Coins,
  Sparkles,
  PackageOpen,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GachaWinRecord } from '@/types/gacha';

interface GachaWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  winRecord: GachaWinRecord | null;
  onRequestApplyNow: (member: string) => void;
}

export const GachaWinModal: React.FC<GachaWinModalProps> = ({
  isOpen,
  onClose,
  winRecord,
  onRequestApplyNow,
}) => {
  const [isUnboxed, setIsUnboxed] = useState(false);

  useEffect(() => {
    if (isOpen && winRecord) {
      setIsUnboxed(Boolean(winRecord.unboxed));
    }
  }, [isOpen, winRecord]);

  if (!isOpen || !winRecord) return null;

  const handleUnbox = async () => {
    setIsUnboxed(true);
    confetti({
      particleCount: 110,
      spread: 85,
      origin: { y: 0.55 },
      colors: ['#f59e0b', '#fbbf24', '#22d3ee', '#10b981', '#a855f7'],
    });
    try {
      await fetch('/api/gacha/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winId: winRecord.id,
          member: winRecord.member,
          action: 'unbox',
        }),
      });
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-amber-500/50 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-cyan-950/50 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
              <Gift className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">UFO 크레인 뽑기 성공!</h2>
              <p className="text-[11px] text-amber-300 font-semibold">
                {winRecord.member}님이 {winRecord.boxLabel}를 획득했습니다
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {!isUnboxed ? (
            /* 1단계: 상자 뜯기 전 */
            <div className="py-6 text-center space-y-5">
              <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-amber-500/30 via-orange-500/20 to-rose-500/30 border-2 border-amber-400/70 flex items-center justify-center shadow-2xl shadow-amber-500/20 animate-bounce">
                <PackageOpen className="w-12 h-12 text-amber-300" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">두근두근! 상자 안에 뭐가 들었을까요?</h3>
                <p className="text-xs text-slate-400">
                  Bar 사이로 떨어뜨린 미스터리 상자를 직접 뜯어서 보상을 확인하세요!
                </p>
              </div>
              <button
                type="button"
                onClick={handleUnbox}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
              >
                <Sparkles className="w-5 h-5" />
                <span>상자 뜯어보기!</span>
              </button>
            </div>
          ) : (
            /* 2단계: 당첨 내용 공개 + 즉시 리워드 신청 여부 확인 (예 / 아니오) */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/15 to-cyan-500/20 border border-amber-400/50 text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-black">
                  <Coins className="w-3.5 h-3.5" />
                  <span>SOLANA REWARD</span>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-cyan-300">
                  {winRecord.rewardAmount} SOL 당첨!
                </div>
                <p className="text-xs text-white font-bold pt-1">
                  즉시 리워드 신청을 하시겠습니까?
                </p>
              </div>

              {/* 업비트 0.01 SOL 입금 제한 안내 */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-200 leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300">업비트 입금 제한 안내 (0.02 SOL 이상 권장)</p>
                  <p className="text-[11px] text-slate-300">
                    업비트는 <strong className="text-amber-300">0.01 SOL 입금 제한</strong>이 있어 2개 이상(
                    <strong className="text-cyan-300">0.02 SOL~</strong>) 모아서 받으시는 것이 안전합니다.
                    <strong className="text-white"> 아니오</strong>를 누르셔도 당첨 기록은 유지되며, 상단{' '}
                    <strong className="text-amber-300">[명예의 전당]</strong>에서 언제든 합산 신청하실 수 있습니다.
                  </p>
                </div>
              </div>

              {/* 예 / 아니오 버튼 */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  아니오 (모아두기)
                </button>
                <button
                  type="button"
                  onClick={() => onRequestApplyNow(winRecord.member)}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-purple-600/25 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <span>예 (즉시 신청)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
