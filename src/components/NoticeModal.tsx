'use client';

import React, { useState } from 'react';
import { X, Bell, Sparkles, ShieldCheck, Info, Award, ChevronDown, ChevronUp, Gift } from 'lucide-react';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({ isOpen, onClose }) => {
  const [open261030, setOpen261030] = useState(false);
  const [open261101, setOpen261101] = useState(false);
  const [open261102, setOpen261102] = useState(false);

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
        <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-200 max-h-[75vh] overflow-y-auto">
          {/* 261030 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-blue-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261030(!open261030)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                  📌 261030 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  평가 모델 교체 안내 (NVIDIA NIM 1T)
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-10-30</span>
                {open261030 ? (
                  <ChevronUp className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261030 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  평가의 신뢰성을 위해 당일 저녁부터 평가 모델을 교체하였습니다.
                </p>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p><span className="text-amber-400 font-bold">모델 이름 :</span> NVIDIA NIM Vision 모델 (mistralai/mistral-large-4-1t-a52b)</p>
                  <p><span className="text-amber-400 font-bold">모델 스펙 :</span> 1T(1조 파라미터) 초대형 모델 + CoT(생각의 사슬) 추론</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  이전의 게시글도 재심사 하였습니다(이전 게시글은 위너 변동X)
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  각 게시글마다 0점부터 100점까지 다채롭고 객관적인 평가 기준을 도입했습니다.
                </p>
              </div>
            )}
          </div>

          {/* 261101 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-indigo-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261101(!open261101)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  📌 261101 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  폴백 모델 및 리워드 지급현황 안내
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-01</span>
                {open261101 ? (
                  <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261101 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  출품한 작품은 4가지 폴백 모델에 의해 평가됩니다.
                </p>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p><span className="text-indigo-400 font-bold">1.</span> mistralai/mistral-large-4-1t-a52b</p>
                  <p><span className="text-indigo-400 font-bold">2.</span> meta/muse-glimmer-30b</p>
                  <p><span className="text-indigo-400 font-bold">3.</span> nvidia/nemotron-3.5-super-vl-120b-a12b</p>
                  <p><span className="text-indigo-400 font-bold">4.</span> sr-combo</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  각 평가의 코멘트 끝에 평가 모델이 기재됩니다.
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  다른 모델이 평가해서 점수가 마음에 안들면 관리자에게 이의신청을 할 수 있습니다.
                </p>
                <p className="text-amber-300 text-xs sm:text-sm flex items-center gap-2 pt-1 border-t border-slate-800/80 font-bold">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  명예의 전당에서 리워드 지급현황을 확인할 수 있습니다
                </p>
              </div>
            )}
          </div>

          {/* 261102 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-purple-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261102(!open261102)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                  📌 261102 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  리워드 시스템 구축
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-02</span>
                {open261102 ? (
                  <ChevronUp className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261102 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Gift className="w-4 h-4 text-purple-400 shrink-0" />
                  간단한 솔라나 문제를 풀고 관리자에게 리워드를 신청할 수 있습니다.
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  관리자를 제외하고 히든 멤버를 추가하였습니다.
                </p>
              </div>
            )}
          </div>

          {/* 추가 안내 박스 (신규 AI 비전 모델 적용 안내 - 그대로 유지) */}
          <div className="flex items-start space-x-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm">신규 AI 비전 모델 적용 안내</h4>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                출품된 식사 사진을 실제 시각적으로 직접 판독(국물 색, 재료 상태, 플레이팅 등)하여 보다 공정하고 엄격한 미식 평가 점수를 부여합니다(각 사진당 평가 평균 <span className="text-red-400 font-bold">4~5분</span> 이상 소요). 비식사 사진(셀카 등)은 자동으로 최하점 처리됩니다.
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
