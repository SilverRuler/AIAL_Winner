'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, Plus, Utensils, Sparkles, HelpCircle, Lock, ShieldCheck, Bell, Gamepad2, Wallet, CalendarCheck, Radio, Dices, ChevronLeft, ChevronRight } from 'lucide-react';

interface HeaderProps {
  onOpenNewMeal: () => void;
  onOpenLeaderboard: () => void;
  onOpenNotice: () => void;
  onOpenOperatorBalance: () => void;
  onOpenAttendance: () => void;
  onOpenHowTo: () => void;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
  onOpenAdminQuiz?: () => void;
  onOpenPresence?: () => void;
  onGoHome?: () => void;
  isAdmin: boolean;
  activeUsersCount?: number;
  totalMealsCount: number;
  totalWinsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewMeal,
  onOpenLeaderboard,
  onOpenNotice,
  onOpenOperatorBalance,
  onOpenAttendance,
  onOpenHowTo,
  onOpenAdminLogin,
  onAdminLogout,
  onOpenAdminQuiz,
  onOpenPresence,
  onGoHome,
  isAdmin,
  activeUsersCount = 0,
  totalMealsCount,
  totalWinsCount,
}) => {
  const actionBarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = actionBarRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  // 모바일·데스크톱 모두 버튼이 가로로 넘칠 때 기본 스크롤을 우측 끝(식사 등록 노출)으로 맞추고,
  // 좌측 스와이프 / 마우스 휠 / 좌우 화살표 버튼으로 '명예의 전당'까지 전부 접근 가능하도록 유지
  useEffect(() => {
    const syncRightDefault = () => {
      const el = actionBarRef.current;
      if (!el) return;
      if (el.scrollWidth > el.clientWidth) {
        el.scrollLeft = el.scrollWidth;
      }
      updateScrollIndicators();
    };
    syncRightDefault();
    const raf = requestAnimationFrame(syncRightDefault);
    window.addEventListener('resize', syncRightDefault);

    const el = actionBarRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateScrollIndicators);
      ro.observe(el);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', syncRightDefault);
      ro?.disconnect();
    };
  }, [isAdmin, totalWinsCount, activeUsersCount, updateScrollIndicators]);

  const handleWheelScroll = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = actionBarRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      updateScrollIndicators();
    }
  }, [updateScrollIndicators]);

  const scrollActionBarBy = useCallback((delta: number) => {
    const el = actionBarRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between py-2.5 sm:py-0 sm:h-20 gap-2 sm:gap-3">
          {/* 1. 상단/좌측: 로고, 타이틀, 출석보상 & 관리자(로그아웃)까지 항상 온전하게 고정 표시 */}
          <div className="flex items-center justify-between sm:justify-start space-x-2.5 sm:space-x-3 shrink-0">
            <div className="flex items-center space-x-2.5 shrink-0">
              {/* 식사 이미지 + 타이틀 + 서브타이틀 (클릭 시 홈 복귀) */}
              <div
                onClick={onGoHome}
                className="flex items-center space-x-2.5 cursor-pointer group shrink-0"
                title="AIAL Winner 홈으로 이동 (필터 초기화)"
              >
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20 ring-2 ring-amber-400/30 shrink-0 group-hover:scale-105 transition-transform">
                  <Utensils className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="shrink-0">
                  <div className="flex items-center space-x-1.5 flex-wrap sm:flex-nowrap whitespace-nowrap">
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

                    {/* 출석보상 버튼 (관리자 로그인 버튼 왼쪽 · 모바일에서는 '출석' 표시) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAttendance();
                      }}
                      className="inline-flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/50 text-[10px] sm:text-xs font-black transition-all cursor-pointer shrink-0 shadow-sm shadow-amber-900/30"
                      title="출석보상 받기 (매일 09:00~09:10 · 15:00~15:10 KST · 뽑기권 +3)"
                    >
                      <CalendarCheck className="w-3 h-3 text-amber-300" />
                      <span className="sm:hidden">출석</span>
                      <span className="hidden sm:inline">출석보상</span>
                    </button>

                    {/* 관리자 로그인/로그아웃 버튼 */}
                    {isAdmin ? (
                      <div className="flex items-center gap-1.5">
                        {onOpenPresence && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPresence();
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 text-[10px] sm:text-xs font-black hover:bg-emerald-500/35 hover:text-white transition-all cursor-pointer shrink-0 shadow-sm shadow-emerald-900/30"
                            title="실시간 IP별 동접 현황 보기"
                          >
                            <Radio className="w-3 h-3 text-emerald-300 animate-pulse" />
                            <span>동접 {activeUsersCount}</span>
                          </button>
                        )}
                        {onOpenAdminQuiz && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAdminQuiz();
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-purple-600/30 text-purple-200 border border-purple-400/50 text-[10px] sm:text-xs font-black hover:bg-purple-600/50 hover:text-white transition-all cursor-pointer shrink-0 shadow-sm shadow-purple-900/30"
                            title="온체인 퀴즈 관리"
                          >
                            <HelpCircle className="w-3 h-3 text-purple-300" />
                            <span>QUIZ</span>
                          </button>
                        )}
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
                      </div>
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

          {/* 2. 하단/우측: [명예의 전당] ~ [식사 등록] 가로 스크롤 영역 (데스크톱 휠·화살표 + 모바일 스와이프 지원) */}
          <div className="relative flex items-center flex-1 min-w-0 max-w-full">
            {canScrollLeft && (
              <div className="hidden sm:flex items-center absolute left-0 top-0 bottom-0 z-10 pr-4 bg-gradient-to-r from-slate-950 via-slate-950/95 to-transparent pointer-events-none">
                <button
                  type="button"
                  onClick={() => scrollActionBarBy(-220)}
                  className="pointer-events-auto inline-flex items-center justify-center w-7 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-400/50 text-amber-300 hover:text-white shadow-lg cursor-pointer transition-colors"
                  title="왼쪽 메뉴 더 보기"
                  aria-label="왼쪽으로 스크롤"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}

            <div
              ref={actionBarRef}
              onScroll={updateScrollIndicators}
              onWheel={handleWheelScroll}
              className="flex items-center justify-start gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1 w-full min-w-0 max-w-full touch-pan-x"
            >
            {/* 1) 명예의 전당 (first:ml-auto로 여유 폭이 있을 땐 우측 정렬, 넘칠 땐 좌측 끝까지 스크롤 가능) */}
            <button
              onClick={onOpenLeaderboard}
              className="ml-auto inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all text-[11px] sm:text-sm font-semibold shrink-0 cursor-pointer"
              title="먀미의 승리(WIN) 랭킹 및 명예의 전당"
            >
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              <span className="hidden sm:inline">명예의 전당</span>
              <span className="px-1.5 py-0.2 bg-amber-500/20 rounded-full text-[10px] sm:text-[11px] font-bold">
                {totalWinsCount}W
              </span>
            </button>

            {/* 2) 공지사항 */}
            <button
              onClick={onOpenNotice}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-blue-500/30 text-blue-300 hover:text-white hover:bg-blue-500/10 hover:border-blue-500/60 transition-all text-[11px] sm:text-sm font-semibold shrink-0 cursor-pointer relative"
              title="AIAL Winner 공지사항"
            >
              <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span className="sm:hidden">공지</span>
              <span className="hidden sm:inline">공지사항</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute top-1.5 right-1.5 animate-pulse" />
            </button>

            {/* 2-2) 운영자 잔고 (공지사항과 뽑기하러 가기 사이) */}
            <button
              onClick={onOpenOperatorBalance}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 hover:text-white hover:bg-emerald-500/15 hover:border-emerald-400/70 transition-all text-[11px] sm:text-sm font-semibold shrink-0 cursor-pointer"
              title="운영자 솔라나(SOL) 리워드 잔고 및 시세 확인"
            >
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span className="sm:hidden">잔고</span>
              <span className="hidden sm:inline">운영자 잔고</span>
            </button>

            {/* 3-1) 실시간 눈치 미니게임 (4500 포트 · 뽑기하러 가기 바로 왼쪽) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window === 'undefined') return;
                const savedMem = localStorage.getItem('aial_gacha_member') || '';
                const qs = savedMem ? `?member=${encodeURIComponent(savedMem)}` : '';
                window.location.href = `http://oci2.silverruler.xyz:4500${qs}`;
              }}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-fuchsia-500/20 to-pink-600/25 border border-fuchsia-400/60 text-fuchsia-200 hover:text-white hover:from-fuchsia-500/35 hover:to-pink-600/40 transition-all text-[11px] sm:text-sm font-black shrink-0 shadow-sm shadow-fuchsia-900/40 cursor-pointer"
              title="실시간 눈치 미니게임 (매일 14:00~14:03 · 단독 우승 시 뽑기권 +5장)"
            >
              <Dices className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fuchsia-300" />
              <span className="sm:hidden">미니</span>
              <span className="hidden sm:inline">미니게임</span>
            </button>

            {/* 3-2) UFO 뽑기하러 가기 버튼 (서버 설정에 따라 4000 Jolt / 4100 Rapier 즉시 스위칭 리다이렉션) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window === 'undefined') return;
                const savedMem = localStorage.getItem('aial_gacha_member') || '';
                const savedMachine = localStorage.getItem('aial_gacha_machine_idx') || '';
                const params = new URLSearchParams();
                if (savedMem) params.set('member', savedMem);
                if (savedMachine) params.set('machine', savedMachine);
                const qs = params.toString();
                window.location.href = `/api/gacha/go${qs ? `?${qs}` : ''}`;
              }}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-600/25 border border-cyan-400/60 text-cyan-200 hover:text-white hover:from-cyan-500/35 hover:to-blue-600/40 transition-all text-[11px] sm:text-sm font-black shrink-0 shadow-sm shadow-cyan-900/40 cursor-pointer"
              title="3D UFO 브릿지 뽑기하러 가기"
            >
              <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
              <span className="sm:hidden">뽑기</span>
              <span className="hidden sm:inline">뽑기하러 가기</span>
            </button>

            {/* 4) 사용 방법 */}
            <button
              onClick={onOpenHowTo}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 transition-all text-[11px] sm:text-sm font-semibold shrink-0 cursor-pointer"
              title="AIAL Winner 이용 방법 및 가이드"
            >
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
              <span className="sm:hidden">안내</span>
              <span className="hidden sm:inline">사용방법</span>
            </button>

            {/* 5) 식사 등록 */}
            <button
              onClick={onOpenNewMeal}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white font-bold text-[11px] sm:text-sm shadow-md shadow-orange-500/25 hover:from-orange-600 hover:to-rose-600 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>식사 등록</span>
            </button>
            </div>

            {canScrollRight && (
              <div className="hidden sm:flex items-center absolute right-0 top-0 bottom-0 z-10 pl-4 bg-gradient-to-l from-slate-950 via-slate-950/95 to-transparent pointer-events-none">
                <button
                  type="button"
                  onClick={() => scrollActionBarBy(220)}
                  className="pointer-events-auto inline-flex items-center justify-center w-7 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-400/50 text-amber-300 hover:text-white shadow-lg cursor-pointer transition-colors"
                  title="오른쪽 메뉴 더 보기"
                  aria-label="오른쪽으로 스크롤"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
