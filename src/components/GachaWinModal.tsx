'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Gift,
  Coins,
  Sparkles,
  Wallet,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PackageOpen,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GachaWinRecord } from '@/types/gacha';

interface GachaWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  winRecord: GachaWinRecord | null;
  onClaimSuccess: () => void;
}

export const GachaWinModal: React.FC<GachaWinModalProps> = ({
  isOpen,
  onClose,
  winRecord,
  onClaimSuccess,
}) => {
  const [isUnboxed, setIsUnboxed] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen && winRecord) {
      setIsUnboxed(Boolean(winRecord.unboxed));
      setErrorMsg('');
      setSuccessMsg('');
      setMemo('');
      if (typeof window !== 'undefined') {
        const savedWallet = localStorage.getItem(`aial_sol_wallet_${winRecord.member}`) || '';
        setWalletAddress(savedWallet);
      }
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

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedWallet = walletAddress.trim();
    if (!trimmedWallet) {
      setErrorMsg('SOL을 수령할 솔라나 지갑 주소를 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const resp = await fetch('/api/gacha/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winId: winRecord.id,
          member: winRecord.member,
          walletAddress: trimmedWallet,
          memo: memo.trim(),
          action: 'claim',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || '수령 신청 실패');
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(`aial_sol_wallet_${winRecord.member}`, trimmedWallet);
      }
      setSuccessMsg(data.message || '관리자에게 텔레그램 수령 신청이 완료되었습니다!');
      onClaimSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || '신청 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
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
          ) : successMsg ? (
            /* 3단계: 텔레그램 신청 완료 */
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">리워드 신청 완료!</h3>
                <p className="text-xs text-emerald-300 leading-relaxed">{successMsg}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                뽑기 화면으로 돌아가기
              </button>
            </div>
          ) : (
            /* 2단계: 당첨 내용 공개 + 지갑 입력 */
            <form onSubmit={handleClaim} className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/15 to-cyan-500/20 border border-amber-400/50 text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-black">
                  <Coins className="w-3.5 h-3.5" />
                  <span>SOLANA REWARD</span>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-cyan-300">
                  {winRecord.rewardAmount} SOL 당첨!
                </div>
                <p className="text-[11px] text-slate-300">
                  지갑 주소를 입력하시면 관리자에게 즉시 텔레그램 지급 요청이 발송됩니다.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-purple-400" />
                  <span>솔라나(SOL) 수령 지갑 주소</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Solana 지갑 주소 입력 (예: 7xKXt...)"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  관리자에게 한마디 <span className="text-slate-500 font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: 우유부단하게 걸려있던 거 한방에 뽑았습니다!"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>텔레그램 신청 전송 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>관리자에게 {winRecord.rewardAmount} SOL 수령 신청하기</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
