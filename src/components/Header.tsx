'use client';

import React from 'react';
import { Trophy, Plus, Utensils, Sparkles, HelpCircle, Lock, ShieldCheck, Bell } from 'lucide-react';

interface HeaderProps {
  onOpenNewMeal: () => void;
  onOpenLeaderboard: () => void;
  onOpenNotice: () => void;
  onOpenHowTo: () => void;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
  onGoHome?: () => void;
  isAdmin: boolean;
  totalMealsCount: number;
  totalWinsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewMeal,
  onOpenLeaderboard,
  onOpenNotice,
  onOpenHowTo,
  onOpenAdminLogin,
  onAdminLogout,
  onGoHome,
  isAdmin,
  totalMealsCount,
  totalWinsCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between py-2.5 sm:py-0 sm:h-20 gap-2 sm:gap-4">
          {/* 1. 상단/좌측: 로고, 타이틀, 서브타이틀 (클릭 시 홈으로 이동) & 관리자 버튼 */}
          <div className="flex items-center justify-between sm:justify-start space-x-2.5 sm:space-x-3 shrink-0">
            <div className="flex items-center space-x-2.5">
              {/* 식사 이미지 + 타이틀 + 서브타이틀 (클릭 시 홈 복귀) */}
              <div
                onClick={onGoHome}
                className="flex items-center space-x-2.5 cursor-pointer group"
                title="AIAL Winner 홈으로 이동 (필터 초기화)"
              >
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20 ring-2 ring-amber-400/30 shrink-0 group-hover:scale-105 transition-transform">
                  <Utensils className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <h1 className="text-base sm:text-xl font-black tracking-tight text-white flex items-center gap-1 group-hover:opacity-90 transition-opacity">
                      <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                        AIAL
                      </span>
                      <span className="text-white">Winner</span>
                    </h1>

                    <span
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold tracking-normal inline-flex items-center gap-0.5 shrink-0"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      미식 배틀
                    </span>

                    {/* 관리자 로그인/로그아웃 버튼 */}
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdminLogout();
                        }}
                        className="inline-flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] sm:text-xs font-bold hover:bg-emerald-500/30 transition-all cursor-pointer shrink-0"
                        title="클릭하여 관리자 로그아웃"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>관리자 (로그아웃)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAdminLogin();
                        }}
                        className="inline-flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-amber-300 hover:bg-slate-800 border border-slate-700 text-[10px] sm:text-xs font-medium transition-all cursor-pointer shrink-0"
                        title="관리자 로그인 (AI 수동 심사 활성화)"
                      >
                        <Lock className="w-3 h-3" />
                        <span>관리자</span>
                      </button>
                    )}
                  </div>

                  {/* 먀미의 식사 사진 중... 서브타이틀 */}
                  <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block mt-0.5">
                    먀미의 식사 사진 중 AI가 가장 맛있는 음식(WIN)을 가린다!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 하단/우측: [명예의 전당] - [사용 방법] - [식사 등록] 버튼 그룹 */}
          <div className="flex items-center justify-end space-x-1.5 sm:space-x-2.5 overflow-x-auto no-scrollbar py-0.5">
            {/* 1) 명예의 전당 */}
            <button
              onClick={onOpenLeaderboard}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
              title="먀미의 승리(WIN) 랭킹 및 명예의 전당"
            >
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              <span className="hidden xs:inline sm:inline">명예의 전당</span>
              <span className="px-1.5 py-0.2 bg-amber-500/20 rounded-full text-[10px] sm:text-[11px] font-bold">
                {totalWinsCount}W
              </span>
            </button>

            {/* 2) 공지사항 */}
            <button
              onClick={onOpenNotice}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-blue-500/30 text-blue-300 hover:text-white hover:bg-blue-500/10 hover:border-blue-500/60 transition-all text-xs sm:text-sm font-semibold shrink-0 cursor-pointer relative"
              title="AIAL Winner 공지사항"
            >
              <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span>공지사항</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute top-1.5 right-1.5 animate-pulse" />
            </button>

            {/* 3) 사용 방법 */}
            <button
              onClick={onOpenHowTo}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 transition-all text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
              title="AIAL Winner 이용 방법 및 가이드"
            >
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
              <span>사용방법</span>
            </button>

            {/* 3) 식사 등록 */}
            <button
              onClick={onOpenNewMeal}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/25 hover:from-orange-600 hover:to-rose-600 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>식사 등록</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
