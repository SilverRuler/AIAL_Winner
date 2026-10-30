'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trophy,
  Crown,
  Loader2,
  Utensils,
  Plus,
  RefreshCw,
  Award,
  AlertCircle,
  Lock,
  Users,
  Clock,
  Moon,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MealEntry, MealSlot, MealComment, BestWinnerInfo } from '@/types/meal';
import {
  getCurrentMealSlot,
  MEAL_SLOTS,
  getKSTNow,
  checkCanRegisterMeal,
} from '@/constants/members';
import { Header } from '@/components/Header';
import { MealSlotTabs } from '@/components/MealSlotTabs';
import { MealCard } from '@/components/MealCard';
import { NewMealModal } from '@/components/NewMealModal';
import { LeaderboardModal } from '@/components/LeaderboardModal';
import { HowToModal } from '@/components/HowToModal';
import { NoticeModal } from '@/components/NoticeModal';
import { AdminLoginModal } from '@/components/AdminLoginModal';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { AdminAuthModal, AdminActionType } from '@/components/AdminAuthModal';
import { MemberFilterPopover } from '@/components/MemberFilterPopover';
import { ScoreFilterPopover, ScoreRange } from '@/components/ScoreFilterPopover';
import { BestWinnerModal } from '@/components/BestWinnerModal';
import { MealDetailModal } from '@/components/MealDetailModal';
import { getLocalMeals, saveLocalMeals, calculateMemberWinStats } from '@/lib/storage';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>('아침');
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // 멤버별 조회 필터 상태
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);
  const [filterScope, setFilterScope] = useState<'all' | 'date'>('all');

  // 점수별 조회 필터 상태 (10개 점수 구간 버튼 지원)
  const [selectedScoreFilter, setSelectedScoreFilter] = useState<ScoreRange | null>(null);
  const [scoreFilterScope, setScoreFilterScope] = useState<'all' | 'date'>('all');

  // 달력 피커 ref
  const dateInputRef = useRef<HTMLInputElement>(null);

  // 모달 상태 관리
  const [isNewMealOpen, setIsNewMealOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [isHowToOpen, setIsHowToOpen] = useState<boolean>(false);
  const [isNoticeOpen, setIsNoticeOpen] = useState<boolean>(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState<boolean>(false);
  const [isBestWinnerOpen, setIsBestWinnerOpen] = useState<boolean>(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);
  const [selectedDetailMeal, setSelectedDetailMeal] = useState<MealEntry | null>(null);

  // 관리자 모달 상태
  const [adminTargetMeal, setAdminTargetMeal] = useState<MealEntry | null>(null);
  const [adminAction, setAdminAction] = useState<AdminActionType>('delete');

  // 초기 날짜 및 타임 설정, 관리자 세션 복원, 로컬 캐시 즉시 표시 (KST 기준)
  useEffect(() => {
    const kst = getKSTNow();
    setSelectedDate(kst.date);
    setSelectedSlot(getCurrentMealSlot());

    // 0초 즉시 렌더링: 로컬스토리지에 기존 식사 데이터가 있으면 스피너 대기 없이 즉시 화면에 출력
    const cached = getLocalMeals();
    if (cached && cached.length > 0) {
      setMeals(cached);
      setIsLoading(false);
    }

    if (typeof window !== 'undefined') {
      const savedAdmin = sessionStorage.getItem('aial_is_admin');
      if (savedAdmin === 'true') {
        setIsAdmin(true);
      }
    }
  }, []);

  // 식사 데이터 불러오기 (백그라운드 갱신)
  const fetchMeals = useCallback(async () => {
    try {
      setMeals((prev) => {
        if (!prev || prev.length === 0) {
          setIsLoading(true);
        }
        return prev;
      });

      const resp = await fetch('/api/meals');
      const data = await resp.json();

      if (data.success && Array.isArray(data.meals)) {
        if (data.meals.length > 0) {
          setMeals(data.meals);
          saveLocalMeals(data.meals);
        } else {
          const local = getLocalMeals();
          setMeals(local);
        }
      } else {
        const local = getLocalMeals();
        setMeals(local);
      }
    } catch (e) {
      console.warn('API fetch failed, fallback to local storage:', e);
      const local = getLocalMeals();
      setMeals(local);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  // 달력 아이콘 또는 인풋 클릭 시 브라우저 네이티브 달력 팝업 열기
  const handleOpenCalendar = () => {
    if (dateInputRef.current) {
      if ('showPicker' in HTMLInputElement.prototype) {
        try {
          dateInputRef.current.showPicker();
        } catch (e) {
          dateInputRef.current.focus();
        }
      } else {
        dateInputRef.current.focus();
      }
    }
  };

  // 날짜 입력 유효성 검사 (20203 같은 비정상 연도 입력 방어)
  const handleDateChange = (val: string) => {
    if (!val) return;
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = val.match(datePattern);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        setSelectedDate(val);
      }
    }
  };

  // 날짜 이동 헬퍼
  const handleShiftDate = (days: number) => {
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + days);
    const newY = dateObj.getFullYear();
    const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newD = String(dateObj.getDate()).padStart(2, '0');
    setSelectedDate(`${newY}-${newM}-${newD}`);
  };

  // 관리자 로그인/로그아웃
  const handleAdminLoginSuccess = () => {
    setIsAdmin(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('aial_is_admin', 'true');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('aial_is_admin');
    }
  };

  // 현재 선택된 날짜의 식사 목록
  const mealsOnSelectedDate = useMemo(() => {
    return meals.filter((m) => m.date === selectedDate);
  }, [meals, selectedDate]);

  // 슬롯별 참가자 수
  const slotCounts = useMemo(() => {
    const counts: Record<MealSlot, number> = { 아침: 0, 점심: 0, 저녁: 0 };
    for (const m of mealsOnSelectedDate) {
      if (counts[m.slot] !== undefined) {
        counts[m.slot] += 1;
      }
    }
    return counts;
  }, [mealsOnSelectedDate]);

  // 슬롯별 우승자 이름 (공동 우승 지원)
  const slotWinners = useMemo(() => {
    const winners: Record<MealSlot, string | undefined> = { 아침: undefined, 점심: undefined, 저녁: undefined };
    for (const m of mealsOnSelectedDate) {
      if (m.isWinner) {
        winners[m.slot] = winners[m.slot] ? `${winners[m.slot]}, ${m.member}` : m.member;
      }
    }
    return winners;
  }, [mealsOnSelectedDate]);

  // 현재 선택된 슬롯의 식사 목록 (우승자 맨 앞, 그 후 등록시간 역순)
  const currentSlotMeals = useMemo(() => {
    const slotMeals = mealsOnSelectedDate.filter((m) => m.slot === selectedSlot);
    return [...slotMeals].sort((a, b) => {
      if (a.isWinner && !b.isWinner) return -1;
      if (!a.isWinner && b.isWinner) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [mealsOnSelectedDate, selectedSlot]);

  // 현재 슬롯의 우승 식사 정보 (공동 우승 지원)
  const currentSlotWinners = useMemo(() => {
    return currentSlotMeals.filter((m) => m.isWinner);
  }, [currentSlotMeals]);
  const currentSlotWinner = currentSlotWinners[0];

  // 현재 날짜 & 슬롯에 이미 등록한 멤버 목록 (1인 1회 제한)
  const submittedMembersForCurrentSlot = useMemo(() => {
    return currentSlotMeals.map((m) => m.member);
  }, [currentSlotMeals]);

  // 식사 타임스탬프 계산 헬퍼 (평가 시간, 생성 시간, 날짜/시간 순 우선순위)
  const getMealTimestamp = (m: MealEntry): number => {
    if (typeof m.evaluatedAt === 'number' && m.evaluatedAt > 0) return m.evaluatedAt;
    if (typeof m.createdAt === 'number' && m.createdAt > 0) return m.createdAt;
    if (m.createdAt) {
      const t = new Date(m.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (m.date && m.time) {
      const t = new Date(`${m.date}T${m.time}:00`).getTime();
      if (!isNaN(t)) return t;
    }
    if (m.date) {
      const slotHour = m.slot === '저녁' ? '22:00:00' : m.slot === '점심' ? '13:30:00' : '10:00:00';
      const t = new Date(`${m.date}T${slotHour}`).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // 특정 멤버 필터링: 전체 날짜 대상 목록 (최신순)
  const memberAllMeals = useMemo(() => {
    if (!selectedMemberFilter) return [];
    return meals
      .filter((m) => m.member === selectedMemberFilter)
      .sort((a, b) => getMealTimestamp(b) - getMealTimestamp(a));
  }, [meals, selectedMemberFilter]);

  // 특정 멤버 필터링: 선택 날짜/슬롯 대상 목록
  const memberDateSlotMeals = useMemo(() => {
    if (!selectedMemberFilter) return [];
    return currentSlotMeals.filter((m) => m.member === selectedMemberFilter);
  }, [currentSlotMeals, selectedMemberFilter]);

  // 특정 점수대 필터링: 전체 날짜 대상 목록 (점수 높은 순 -> 최신순)
  const scoreAllMeals = useMemo(() => {
    if (!selectedScoreFilter) return [];
    return meals
      .filter(
        (m) =>
          typeof m.score === 'number' &&
          m.score >= selectedScoreFilter.min &&
          m.score <= selectedScoreFilter.max
      )
      .sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getMealTimestamp(b) - getMealTimestamp(a);
      });
  }, [meals, selectedScoreFilter]);

  // 특정 점수대 필터링: 선택 날짜/슬롯 대상 목록
  const scoreDateSlotMeals = useMemo(() => {
    if (!selectedScoreFilter) return [];
    return currentSlotMeals
      .filter(
        (m) =>
          typeof m.score === 'number' &&
          m.score >= selectedScoreFilter.min &&
          m.score <= selectedScoreFilter.max
      )
      .sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getMealTimestamp(b) - getMealTimestamp(a);
      });
  }, [currentSlotMeals, selectedScoreFilter]);

  // 화면에 최종 렌더링할 식사 목록
  const displayedMeals = useMemo(() => {
    if (selectedMemberFilter) {
      return filterScope === 'all' ? memberAllMeals : memberDateSlotMeals;
    }
    if (selectedScoreFilter) {
      return scoreFilterScope === 'all' ? scoreAllMeals : scoreDateSlotMeals;
    }
    return currentSlotMeals;
  }, [
    selectedMemberFilter,
    filterScope,
    memberAllMeals,
    memberDateSlotMeals,
    selectedScoreFilter,
    scoreFilterScope,
    scoreAllMeals,
    scoreDateSlotMeals,
    currentSlotMeals,
  ]);

  // 12인의 승리 랭킹 통계 산출
  const memberWinStats = useMemo(() => {
    return calculateMemberWinStats(meals);
  }, [meals]);

  const totalWinsCount = useMemo(() => {
    return meals.filter((m) => m.isWinner).length;
  }, [meals]);

  // BEST WINNER 계산:
  // 1. WIN을 가장 많이 획득한 멤버 선정
  // 2. 동률(2명 이상 동일 WIN 개수)일 경우 가장 마지막에 WIN을 받은 멤버 우선
  // 3. 해당 멤버의 음식들(우승작 및 전체 등록작) 제공
  const bestWinnerData = useMemo<BestWinnerInfo | null>(() => {
    const winnerMeals = meals.filter((m) => m.isWinner);
    if (winnerMeals.length === 0) return null;

    const memberMap: Record<
      string,
      {
        member: string;
        winningMeals: MealEntry[];
        allMeals: MealEntry[];
        latestWinTime: number;
        latestWinMeal: MealEntry | null;
      }
    > = {};

    for (const m of meals) {
      if (!memberMap[m.member]) {
        memberMap[m.member] = {
          member: m.member,
          winningMeals: [],
          allMeals: [],
          latestWinTime: 0,
          latestWinMeal: null,
        };
      }
      memberMap[m.member].allMeals.push(m);
      if (m.isWinner) {
        memberMap[m.member].winningMeals.push(m);
        const winTime = getMealTimestamp(m);
        if (winTime > memberMap[m.member].latestWinTime) {
          memberMap[m.member].latestWinTime = winTime;
          memberMap[m.member].latestWinMeal = m;
        }
      }
    }

    const candidates = Object.values(memberMap).filter((c) => c.winningMeals.length > 0);
    if (candidates.length === 0) return null;

    // 1순위: WIN 개수 내림차순, 2순위: 가장 마지막에 WIN을 받은 시각 내림차순
    candidates.sort((a, b) => {
      const winDiff = b.winningMeals.length - a.winningMeals.length;
      if (winDiff !== 0) return winDiff;
      return b.latestWinTime - a.latestWinTime;
    });

    const top = candidates[0];
    const topWinCount = top.winningMeals.length;
    const tiedCandidates = candidates.filter((c) => c.winningMeals.length === topWinCount);
    const isTieBreaker = tiedCandidates.length > 1;

    const sortMealsDesc = (arr: MealEntry[]) =>
      [...arr].sort((a, b) => getMealTimestamp(b) - getMealTimestamp(a));

    const totalSubmissions = top.allMeals.length;
    const winRate = totalSubmissions > 0 ? Math.round((topWinCount / totalSubmissions) * 100) : 0;

    return {
      member: top.member,
      winCount: topWinCount,
      totalSubmissions,
      winRate,
      latestWinDate: top.latestWinMeal?.date,
      latestWinSlot: top.latestWinMeal?.slot,
      latestWinTime: top.latestWinTime,
      isTieBreaker,
      winningMeals: sortMealsDesc(top.winningMeals),
      allMeals: sortMealsDesc(top.allMeals),
    };
  }, [meals]);

  // AI 맛 평가 심사 진행 (관리자만 실행 가능)
  const handleRunEvaluation = async () => {
    if (!isAdmin) {
      alert('관리자만 수동 심사를 진행할 수 있습니다.');
      return;
    }

    if (currentSlotMeals.length === 0) {
      alert(`${selectedDate} ${selectedSlot} 타임에 등록된 식사 사진이 없습니다.`);
      return;
    }

    try {
      setIsEvaluating(true);

      const resp = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          slot: selectedSlot,
          clientEntries: currentSlotMeals,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.message || '평가 실행 실패');
      }

      // 우승 축하 폭죽 팡팡
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
      });

      await fetchMeals();
    } catch (e: any) {
      alert(`AI 맛 심사 중 오류 발생: ${e.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  // 새 식사 등록 완료 시
  const handleMealSuccess = (newMeal: MealEntry) => {
    setMeals((prev) => {
      const updated = [newMeal, ...prev];
      saveLocalMeals(updated);
      return updated;
    });
    setSelectedDate(newMeal.date);
    setSelectedSlot(newMeal.slot);
  };

  // 댓글 등록 완료 핸들러 (실시간 상태 반영 및 캐시 저장)
  const handleCommentAdded = (mealId: string, newComment: MealComment) => {
    setMeals((prev) => {
      const updated = prev.map((m) => {
        if (m.id === mealId) {
          const currentComments = m.comments || [];
          return {
            ...m,
            comments: [...currentComments, newComment],
          };
        }
        return m;
      });
      saveLocalMeals(updated);
      return updated;
    });

    setSelectedDetailMeal((prev) => {
      if (prev && prev.id === mealId) {
        return {
          ...prev,
          comments: [...(prev.comments || []), newComment],
        };
      }
      return prev;
    });
  };

  // 댓글 삭제 완료 핸들러
  const handleCommentDeleted = (mealId: string, commentId: string) => {
    setMeals((prev) => {
      const updated = prev.map((m) => {
        if (m.id === mealId) {
          const currentComments = m.comments || [];
          return {
            ...m,
            comments: currentComments.filter((c) => c.id !== commentId),
          };
        }
        return m;
      });
      saveLocalMeals(updated);
      return updated;
    });

    setSelectedDetailMeal((prev) => {
      if (prev && prev.id === mealId) {
        return {
          ...prev,
          comments: (prev.comments || []).filter((c) => c.id !== commentId),
        };
      }
      return prev;
    });
  };

  // 관리자 수정/삭제 핸들러
  const handleAdminConfirm = async (
    adminId: string,
    adminPw: string,
    editData?: { menuName: string; comment: string; member?: string }
  ) => {
    if (!adminTargetMeal) return;

    if (adminAction === 'delete') {
      const resp = await fetch(
        `/api/meals?id=${adminTargetMeal.id}&adminId=${encodeURIComponent(
          adminId
        )}&adminPw=${encodeURIComponent(adminPw)}`,
        { method: 'DELETE' }
      );
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || '삭제 실패');
      }

      setMeals((prev) => {
        const updated = prev.filter((m) => m.id !== adminTargetMeal.id);
        saveLocalMeals(updated);
        return updated;
      });

      setSelectedDetailMeal((prev) => (prev?.id === adminTargetMeal.id ? null : prev));
    } else if (adminAction === 'edit' && editData) {
      const resp = await fetch('/api/meals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: adminTargetMeal.id,
          menuName: editData.menuName,
          comment: editData.comment,
          member: editData.member,
          adminId,
          adminPw,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || '수정 실패');
      }

      setMeals((prev) => {
        const updated = prev.map((m) =>
          m.id === adminTargetMeal.id
            ? {
                ...m,
                menuName: editData.menuName,
                comment: editData.comment,
                member: editData.member || m.member,
              }
            : m
        );
        saveLocalMeals(updated);
        return updated;
      });

      setSelectedDetailMeal((prev) =>
        prev?.id === adminTargetMeal.id
          ? {
              ...prev,
              menuName: editData.menuName,
              comment: editData.comment,
              member: editData.member || prev.member,
            }
          : prev
      );
    }
  };

  // 홈으로 복귀 (모든 필터 초기화, KST 기준 오늘 날짜 및 현재 타임대로 이동)
  const handleGoHome = useCallback(() => {
    setSelectedMemberFilter(null);
    setSelectedScoreFilter(null);
    setFilterScope('all');
    setScoreFilterScope('all');
    const kst = getKSTNow();
    setSelectedDate(kst.date);
    setSelectedSlot(getCurrentMealSlot());
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-x-hidden">
      {/* 상단 글로벌 헤더 */}
      <Header
        onOpenNewMeal={() => setIsNewMealOpen(true)}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        onOpenNotice={() => setIsNoticeOpen(true)}
        onOpenHowTo={() => setIsHowToOpen(true)}
        onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
        onAdminLogout={handleAdminLogout}
        onGoHome={handleGoHome}
        isAdmin={isAdmin}
        totalMealsCount={meals.length}
        totalWinsCount={totalWinsCount}
      />

      {/* 메인 콘텐츠 컨테이너 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6">
        {/* 1. 날짜 탐색 & 캘린더 피커 + 멤버별 조회 컨트롤 바 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm">
          {/* 이전/다음 날짜 이동, 달력 팝업 선택 & 멤버별 조회 */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 w-full sm:w-auto justify-between sm:justify-start flex-wrap gap-y-2">
            <button
              onClick={() => handleShiftDate(-1)}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              title="어제"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* 달력 선택 그룹 */}
            <div
              onClick={handleOpenCalendar}
              className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700 hover:border-amber-500 rounded-xl px-2.5 sm:px-3 py-1.5 transition-colors cursor-pointer shrink-0"
              title="클릭하여 달력에서 날짜 선택"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCalendar();
                }}
                className="p-0.5 text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Calendar className="w-4 h-4" />
              </button>

              <input
                ref={dateInputRef}
                type="date"
                min="2020-01-01"
                max="2035-12-31"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCalendar();
                }}
                className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer w-[125px] sm:w-[135px]"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(getKSTNow().date);
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors shrink-0"
              >
                오늘
              </button>
            </div>

            <button
              onClick={() => handleShiftDate(1)}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              title="내일"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* 달력 우측: 멤버별 조회 팝오버 */}
            <MemberFilterPopover
              selectedMember={selectedMemberFilter}
              onSelectMember={(member) => {
                setSelectedMemberFilter(member);
                if (member) {
                  setFilterScope('all');
                  setSelectedScoreFilter(null);
                }
              }}
              meals={meals}
            />

            {/* 점수별 조회 팝오버 (10개 점수 구간 버튼 지원) */}
            <ScoreFilterPopover
              selectedScore={selectedScoreFilter}
              onSelectScore={(scoreRange) => {
                setSelectedScoreFilter(scoreRange);
                if (scoreRange) {
                  setScoreFilterScope('all');
                  setSelectedMemberFilter(null);
                }
              }}
              meals={meals}
            />

            {/* BEST WINNER 버튼 */}
            <button
              type="button"
              onClick={() => setIsBestWinnerOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/60 hover:border-amber-400 text-amber-300 hover:text-amber-100 transition-all text-xs sm:text-sm font-black shadow-sm hover:shadow-amber-500/20 cursor-pointer shrink-0"
              title="최다 WIN 달성 BEST WINNER의 음식들 보기"
            >
              <Trophy className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>BEST WINNER</span>
            </button>
          </div>

          {/* 현재 날짜/조회 요약 정보 */}
          <div className="flex items-center space-x-2 text-xs text-slate-400 w-full sm:w-auto justify-end">
            <Utensils className="w-4 h-4 text-orange-400" />
            <span>
              선택한 날 총 <strong className="text-white">{mealsOnSelectedDate.length}</strong>개의 식사 사진
            </span>
          </div>
        </div>

        {/* 2. 멤버별 필터링 안내 배너 (멤버 선택 시 표시) */}
        {selectedMemberFilter && (
          <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-slate-900 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fade-in">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span className="text-amber-400 font-extrabold">{selectedMemberFilter}</span>님의 식사 게시글 조회
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                    총 {displayedMeals.length}건
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {filterScope === 'all'
                    ? `${selectedMemberFilter}님이 전체 기간 동안 올린 모든 식사 사진을 모아봅니다.`
                    : `${selectedDate} ${selectedSlot} 타임에 올린 식사 사진입니다.`}
                </p>
              </div>
            </div>

            {/* 범위 토글 버튼 및 필터 해제 */}
            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-wrap gap-y-1.5">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterScope('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterScope === 'all'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  전체 날짜 ({memberAllMeals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope('date')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterScope === 'date'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  선택 날짜 ({memberDateSlotMeals.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMemberFilter(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                전체보기 ✕
              </button>
            </div>
          </div>
        )}

        {/* 2-2. 점수별 필터링 안내 배너 (점수대 선택 시 표시) */}
        {selectedScoreFilter && (
          <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-slate-900 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fade-in">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                <Award className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span className="text-amber-400 font-extrabold">{selectedScoreFilter.label}</span> 점수대 식사 조회
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                    총 {displayedMeals.length}건
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {scoreFilterScope === 'all'
                    ? `전체 기간 동안 ${selectedScoreFilter.label}를 받은 모든 식사 사진을 점수 높은 순으로 모아봅니다.`
                    : `${selectedDate} ${selectedSlot} 타임에서 ${selectedScoreFilter.label}를 받은 식사 사진입니다.`}
                </p>
              </div>
            </div>

            {/* 범위 토글 버튼 및 필터 해제 */}
            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-wrap gap-y-1.5">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setScoreFilterScope('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    scoreFilterScope === 'all'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  전체 날짜 ({scoreAllMeals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScoreFilterScope('date')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    scoreFilterScope === 'date'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  선택 날짜 ({scoreDateSlotMeals.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedScoreFilter(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                전체보기 ✕
              </button>
            </div>
          </div>
        )}

        {/* 3. 식사 타임대 탭 (멤버/점수 전체날짜 모아보기가 아닐 때 표시) */}
        {(!selectedMemberFilter || filterScope === 'date') &&
          (!selectedScoreFilter || scoreFilterScope === 'date') && (
            <MealSlotTabs
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              slotCounts={slotCounts}
              slotWinners={slotWinners}
            />
          )}

        {/* 4. AI 심사 상태 및 우승자 공지 배너 (타임대별 뷰일 때만 표시) */}
        {(!selectedMemberFilter || filterScope === 'date') &&
          (!selectedScoreFilter || scoreFilterScope === 'date') && (
          <div className="relative overflow-hidden rounded-2xl border transition-all">
            {currentSlotWinner ? (
              /* 우승자 발표 완료 배너 */
              <div className="p-4 sm:p-6 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-slate-900 border-amber-500/40 winner-glow">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-amber-400 font-black text-xs sm:text-sm">
                      <Crown className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-400 animate-bounce" />
                      <span>AI 미식 심사위원 공식 발표</span>
                    </div>
                    {currentSlotWinners.length > 1 ? (
                      <h2 className="text-base sm:text-2xl font-black text-white">
                        이번 {selectedSlot} 공동 우승: <span className="text-amber-400">{currentSlotWinners.map((w) => w.member).join(', ')}</span> 님! (동점 {currentSlotWinner.score ? `${currentSlotWinner.score}점` : ''})
                      </h2>
                    ) : (
                      <h2 className="text-base sm:text-2xl font-black text-white">
                        이번 {selectedSlot} 우승: <span className="text-amber-400">{currentSlotWinner.member}</span>
                        님의 &lsquo;{currentSlotWinner.menuName}&rsquo;!
                      </h2>
                    )}
                    {currentSlotWinner.aiReview && (
                      <p className="text-xs sm:text-sm text-slate-300 font-medium italic pt-1">
                        &quot;{currentSlotWinner.aiReview}&quot;
                      </p>
                    )}
                  </div>

                  {/* 재심사 버튼: 관리자 로그인 상태에서만 표시 */}
                  {isAdmin && (
                    <button
                      onClick={handleRunEvaluation}
                      disabled={isEvaluating}
                      className="shrink-0 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isEvaluating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>재심사 중...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>AI 맛 재심사하기</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* 심사 대기 배너 */
              <div className="p-4 sm:p-5 bg-slate-900/90 border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    <span>
                      {checkCanRegisterMeal(selectedDate, selectedSlot).canRegister
                        ? `${selectedSlot} 타임 미식 배틀 진행 중`
                        : `${selectedSlot} 타임 배틀 마감`}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-lg font-bold text-white">
                    현재 {currentSlotMeals.length}명의 식사가 접수되었습니다.
                  </h3>
                  <p className="text-xs text-slate-400">
                    타임 종료 시각(아침 10:00, 점심 13:30, 저녁 22:00)에 AI가 자동으로 Winner를 지정합니다.
                  </p>
                </div>

                {/* 수동 심사 시작 버튼: 관리자 로그인 상태에서만 노출 */}
                {isAdmin && (
                  <button
                    onClick={handleRunEvaluation}
                    disabled={isEvaluating || currentSlotMeals.length === 0}
                    className="shrink-0 inline-flex items-center space-x-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        <span>AI 맛 심사 진행 중...</span>
                      </>
                    ) : (
                      <>
                        <Crown className="w-4 h-4 text-slate-950 fill-slate-950" />
                        <span>AI 맛 심사 시작 (WIN 결정)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. 식사 카드 그리드 */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-xs text-slate-400">식사 일지를 불러오는 중...</span>
          </div>
        ) : displayedMeals.length === 0 ? (
          /* 빈 상태 */
          <div className="py-16 sm:py-24 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center flex flex-col items-center justify-center p-6 space-y-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
              <Utensils className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-lg font-bold text-white">
                {selectedMemberFilter
                  ? `${selectedMemberFilter}님이 올린 식사 사진이 없습니다.`
                  : selectedScoreFilter
                  ? `${selectedScoreFilter.label} 점수대의 식사 사진이 없습니다.`
                  : `${selectedDate} ${selectedSlot}에 등록된 식사 사진이 없습니다.`}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                {selectedMemberFilter
                  ? '다른 멤버를 선택하거나 전체보기를 클릭해보세요.'
                  : selectedScoreFilter
                  ? '다른 점수대를 선택하거나 전체보기를 클릭해보세요.'
                  : '첫 번째로 식사 사진을 올리고 이번 타임 우승(WIN)을 노려보세요!'}
              </p>
            </div>
            {selectedMemberFilter || selectedScoreFilter ? (
              <button
                onClick={() => {
                  setSelectedMemberFilter(null);
                  setSelectedScoreFilter(null);
                }}
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                <span>전체 식사 보기</span>
              </button>
            ) : checkCanRegisterMeal(selectedDate, selectedSlot).canRegister ? (
              <button
                onClick={() => setIsNewMealOpen(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 hover:scale-105 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>지금 사진 올리기</span>
              </button>
            ) : (
              <div className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{checkCanRegisterMeal(selectedDate, selectedSlot).reason || '등록 불가 타임'}</span>
              </div>
            )}
          </div>
        ) : (
          /* 식사 카드 그리드 목록 */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {displayedMeals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onImageClick={(url, title) => setViewerImage({ url, title })}
                onDetailClick={(target) => setSelectedDetailMeal(target)}
                onEdit={(target) => {
                  setAdminTargetMeal(target);
                  setAdminAction('edit');
                }}
                onDelete={(target) => {
                  setAdminTargetMeal(target);
                  setAdminAction('delete');
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer className="mt-auto border-t border-slate-900 py-6 text-center text-xs text-slate-500 space-y-2">
        <p>AIAL Winner · 먀미의 미식 배틀 & AI 맛 판정단</p>
        <p>
          <a
            href="https://github.com/SilverRuler/AIAL_Winner"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className="font-semibold text-slate-300 hover:text-white">Github : AIAL_Winner</span>
          </a>
        </p>
      </footer>

      {/* 모달들 */}
      <NewMealModal
        isOpen={isNewMealOpen}
        onClose={() => setIsNewMealOpen(false)}
        onSuccess={handleMealSuccess}
        defaultDate={selectedDate}
        defaultSlot={selectedSlot}
        submittedMembers={submittedMembersForCurrentSlot}
        allMeals={meals}
      />

      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        stats={memberWinStats}
      />

      <HowToModal
        isOpen={isHowToOpen}
        onClose={() => setIsHowToOpen(false)}
      />

      <NoticeModal
        isOpen={isNoticeOpen}
        onClose={() => setIsNoticeOpen(false)}
      />

      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onSuccess={handleAdminLoginSuccess}
      />

      <BestWinnerModal
        isOpen={isBestWinnerOpen}
        onClose={() => setIsBestWinnerOpen(false)}
        bestWinner={bestWinnerData}
        onImageClick={(url, title) => setViewerImage({ url, title })}
        onMealClick={(meal) => {
          setIsBestWinnerOpen(false);
          setSelectedDetailMeal(meal);
        }}
      />

      <MealDetailModal
        isOpen={!!selectedDetailMeal}
        onClose={() => setSelectedDetailMeal(null)}
        meal={selectedDetailMeal}
        onImageClick={(url, title) => setViewerImage({ url, title })}
        onCommentAdded={handleCommentAdded}
        onCommentDeleted={handleCommentDeleted}
      />

      <AdminAuthModal
        isOpen={!!adminTargetMeal}
        onClose={() => setAdminTargetMeal(null)}
        actionType={adminAction}
        title={adminTargetMeal ? `${adminTargetMeal.member}님의 ${adminTargetMeal.menuName}` : ''}
        initialMenuName={adminTargetMeal?.menuName || ''}
        initialComment={adminTargetMeal?.comment || ''}
        initialMember={adminTargetMeal?.member || ''}
        onConfirm={handleAdminConfirm}
      />

      {/* 이미지 확대 뷰어 모달: 상세 모달 등 모든 모달 상단에 노출되도록 최하단에 배치 */}
      <ImageViewerModal
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
        imageUrl={viewerImage?.url || null}
        title={viewerImage?.title}
      />
    </div>
  );
}
