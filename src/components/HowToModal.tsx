'use client';

import React from 'react';
import { X, HelpCircle, UserCheck, Sparkles, Coins, Lightbulb, CheckCircle2 } from 'lucide-react';

interface HowToModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToModal: React.FC<HowToModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-950/50 via-slate-900 to-slate-900 border-b border-orange-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
              <HelpCircle className="w-4 h-4 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>AIAL Winner 사용 방법</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                먀미의 식사 배틀 가이드 및 리워드 안내
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 안내 */}
        <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-300">
          {/* 1단계 */}
          <div className="flex items-start space-x-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm">1. 간편한 식사 등록</h4>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                특별한 로그인 없이 <strong className="text-amber-400">작성자(본인 닉)</strong>를 클릭하고 음식 사진을 올리세요! (Ctrl+V 이미지 붙여넣기 지원) <strong className="text-red-400 font-bold">각 타임당 1인 1회만 등록 가능합니다.</strong>
              </p>
            </div>
          </div>

          {/* 2단계 */}
          <div className="flex items-start space-x-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm">2. AI 자동 Winner 지정</h4>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                각 식사 타임의 끝에 AI 미식 심사위원단이 자동으로 <strong className="text-orange-400">Winner(우승작)</strong>를 지정해 줍니다.
              </p>
            </div>
          </div>

          {/* 3단계: 솔라나 코인 리워드 */}
          <div className="flex items-start space-x-3 bg-gradient-to-r from-purple-950/40 via-slate-950 to-slate-950 p-3.5 rounded-xl border border-purple-500/30">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-purple-300 text-xs sm:text-sm flex items-center gap-1.5">
                <span>3. 실제 코인 리워드 지급</span>
                <span className="text-[10px] bg-purple-500/30 text-purple-200 px-1.5 py-0.2 rounded font-mono">5 WIN 달성 시</span>
              </h4>
              <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">
                승점 <strong className="text-amber-400">5점(5 WIN)</strong> 달성 시 관리자가 실제 <strong className="text-purple-300">SOL(솔라나) 코인</strong>을 지급합니다! (약 1,000원 상당)
              </p>
            </div>
          </div>

          {/* 꿀팁 안내 */}
          <div className="flex items-start space-x-3 bg-amber-500/10 p-3.5 rounded-xl border border-amber-500/20">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-amber-300 text-xs">💡 미식가 Tip</h4>
              <p className="text-amber-200/90 text-xs mt-0.5 leading-relaxed">
                음식에 대한 코멘트나 맛 소개를 군침 돌게 잘 적으면 AI의 선택을 받을 확률(Win 확률)이 올라갑니다! (안 적어도 무방합니다)
              </p>
            </div>
          </div>

          {/* 문의 및 수정 요청 안내 */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
            <p className="text-xs text-slate-400 font-medium">
              💬 글 수정이나 요청사항은{' '}
              <a
                href="https://open.kakao.com/me/silverruler"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 font-bold underline underline-offset-4 hover:text-amber-300 transition-colors cursor-pointer"
              >
                관리자에게 카톡
              </a>{' '}
              주세요.
            </p>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
};
