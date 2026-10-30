'use client';

import React from 'react';
import { X, Bell, Sparkles, ShieldCheck, Info, Award } from 'lucide-react';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-950/60 via-slate-900 to-slate-900 border-b border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>AIAL Winner 공지사항</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                식사 평가 AI 모델 업데이트 및 시스템 안내
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 안내 */}
        <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-200">
          {/* 공지 카드 */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-blue-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                📌 261030 공지
              </span>
              <span className="text-[11px] text-slate-400">2026-10-30</span>
            </div>

            <div className="space-y-2 pt-1 text-slate-200 leading-relaxed font-medium">
              <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                평가의 신뢰성을 위해 저녁 평가부터 모델을 교체하였습니다.
              </p>
              <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                이전의 게시글도 재심사 하였습니다(이전 게시글은 위너 변동X)
              </p>
              <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400 shrink-0" />
                각 게시글마다 0점부터 100점까지 다채롭고 객관적인 평가 기준을 도입했습니다.
              </p>
            </div>
          </div>

          {/* 추가 안내 박스 */}
          <div className="flex items-start space-x-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm">신규 AI 비전 모델 적용 안내</h4>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                출품된 식사 사진을 실제 시각적으로 직접 판독(국물 색, 재료 상태, 플레이팅 등)하여 보다 공정하고 엄격한 미식 평가 점수를 부여합니다(각 사진당 평가 <span className="text-red-400 font-bold">4~5분</span> 이상 소요). 비식사 사진(셀카 등)은 자동으로 최하점 처리됩니다.
              </p>
            </div>
          </div>

          {/* 닫기 버튼 */}
          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
