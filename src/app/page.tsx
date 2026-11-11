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
  Flame,
  Search,
  ArrowDown,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MealEntry, MealSlot, MealComment, BestWinnerInfo, BestScoreInfo } from '@/types/meal';
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
import { BestScoreModal } from '@/components/BestScoreModal';
import { SearchModal } from '@/components/SearchModal';
import { RewardModal } from '@/components/RewardModal';
import { AdminQuizModal } from '@/components/AdminQuizModal';
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
  const [isAdminQuizOpen, setIsAdminQuizOpen] = useState<boolean>(false);
  const [isBestWinnerOpen, setIsBestWinnerOpen] = useState<boolean>(false);
  const [isBestScoreOpen, setIsBestScoreOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isRewardOpen, setIsRewardOpen] = useState<boolean>(false);
  const [rewardTargetMember, setRewardTargetMember] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchFilterScope, setSearchFilterScope] = useState<'current' | 'all'>('all');
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
      const savedAdmin =
        sessionStorage.getItem('aial_is_admin') === 'true' ||
        localStorage.getItem('aial_is_admin') === 'true' ||
        sessionStorage.getItem('aial_admin_id') === 'aaa' ||
        localStorage.getItem('aial_admin_id') === 'aaa';
      if (savedAdmin) {
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

      const resp = await fetch(`/api/meals?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await resp.json();

      if (data.success && Array.isArray(data.meals)) {
        if (data.meals.length > 0) {
          const mapped = data.meals.map((m: any) => ({
            ...m,
            hasLiked: Boolean(
              m.hasLiked ||
                (typeof window !== 'undefined' && localStorage.getItem(`aial_meal_liked_${m.id}`) === '1')
            ),
          }));
          setMeals(mapped);
          saveLocalMeals(mapped);
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

  // 끌어당겨 새로고침 (Pull to Refresh) 상태
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState<boolean>(false);
  const [pullState, setPullState] = useState<'pull' | 'ready' | 'refreshing' | 'complete'>('pull');

  const touchStartRef = useRef<{ y: number; x: number; active: boolean }>({ y: 0, x: 0, active: false });
  const mouseStartRef = useRef<{ y: number; active: boolean }>({ y: 0, active: false });
  const isDraggingRef = useRef<boolean>(false);
  const pullDistanceRef = useRef<number>(0);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  // 새로고침 실행 핸들러 (최신 데이터 패치 및 완료 피드백)
  const triggerRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    setPullState('refreshing');
    setPullDistance(52);

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch {}

    const startTime = Date.now();
    try {
      await fetchMeals();
    } catch (e) {
      console.warn('Pull-to-refresh fetch failed:', e);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed < 500) {
      await new Promise((r) => setTimeout(r, 500 - elapsed));
    }

    setPullState('complete');
    await new Promise((r) => setTimeout(r, 350));

    setPullDistance(0);
    setIsPullRefreshing(false);
    setPullState('pull');
  }, [fetchMeals]);

  useEffect(() => {
    // 모달이 열려 있을 때는 새로고침 제스처 비활성화
    const isAnyModalOpen =
      isNewMealOpen ||
      isLeaderboardOpen ||
      isHowToOpen ||
      isNoticeOpen ||
      isAdminLoginOpen ||
      isBestWinnerOpen ||
      isBestScoreOpen ||
      isSearchOpen ||
      isRewardOpen ||
      !!selectedDetailMeal ||
      !!viewerImage ||
      !!adminTargetMeal;

    if (isAnyModalOpen) return;

    const PULL_THRESHOLD = 65;
    const MAX_PULL = 90;

    // 터치 이벤트 핸들러 (모바일/태블릿)
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 5) return;
      if (isPullRefreshing) return;

      const touch = e.touches[0];
      touchStartRef.current = {
        y: touch.clientY,
        x: touch.clientX,
        active: true,
      };
      isDraggingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current.active) return;
      if (isPullRefreshing) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaX = touch.clientX - touchStartRef.current.x;

      if (window.scrollY > 0) {
        touchStartRef.current.active = false;
        isDraggingRef.current = false;
        setPullDistance(0);
        return;
      }

      // 좌우 스와이프가 상하 드래그보다 큰 경우 제스처 무시
      if (Math.abs(deltaX) > deltaY && !isDraggingRef.current) {
        touchStartRef.current.active = false;
        return;
      }

      if (deltaY > 0) {
        isDraggingRef.current = true;
        if (e.cancelable) {
          e.preventDefault();
        }
        const damped = Math.min(Math.pow(deltaY, 0.82) * 1.6, MAX_PULL);
        setPullDistance(damped);
        setPullState(damped >= PULL_THRESHOLD ? 'ready' : 'pull');
      } else {
        setPullDistance(0);
        setPullState('pull');
      }
    };

    const handleTouchEnd = async () => {
      if (!touchStartRef.current.active && !isDraggingRef.current) return;
      touchStartRef.current.active = false;

      const currentDistance = pullDistanceRef.current;
      if (isDraggingRef.current && currentDistance >= PULL_THRESHOLD) {
        isDraggingRef.current = false;
        await triggerRefresh();
      } else {
        isDraggingRef.current = false;
        setPullDistance(0);
        setPullState('pull');
      }
    };

    // 마우스 드래그 핸들러 (데스크톱 마우스 지원)
    const handleMouseDown = (e: MouseEvent) => {
      if (window.scrollY > 5) return;
      if (isPullRefreshing) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, select, a, [role="button"]')) {
        return;
      }
      if (e.clientY > 220) return;

      mouseStartRef.current = { y: e.clientY, active: true };
      isDraggingRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseStartRef.current.active) return;
      if (isPullRefreshing) return;

      if (window.scrollY > 0) {
        mouseStartRef.current.active = false;
        isDraggingRef.current = false;
        setPullDistance(0);
        return;
      }

      const deltaY = e.clientY - mouseStartRef.current.y;
      if (deltaY > 8) {
        isDraggingRef.current = true;
        const damped = Math.min(Math.pow(deltaY, 0.82) * 1.6, MAX_PULL);
        setPullDistance(damped);
        setPullState(damped >= PULL_THRESHOLD ? 'ready' : 'pull');
      }
    };

    const handleMouseUp = async () => {
      if (!mouseStartRef.current.active) return;
      mouseStartRef.current.active = false;

      const currentDistance = pullDistanceRef.current;
      if (isDraggingRef.current && currentDistance >= PULL_THRESHOLD) {
        isDraggingRef.current = false;
        await triggerRefresh();
      } else {
        isDraggingRef.current = false;
        setPullDistance(0);
        setPullState('pull');
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);

      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isNewMealOpen,
    isLeaderboardOpen,
    isHowToOpen,
    isNoticeOpen,
    isAdminLoginOpen,
    isBestWinnerOpen,
    isBestScoreOpen,
    isSearchOpen,
    isRewardOpen,
    selectedDetailMeal,
    viewerImage,
    adminTargetMeal,
    isPullRefreshing,
    triggerRefresh,
  ]);

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

  // 선택된 날짜와 요일 포맷 (예: "2026.10.31. 토")
  const selectedDateFormatted = useMemo(() => {
    if (!selectedDate) return { fullText: '', datePart: '', dayName: '' };
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[dateObj.getDay()] || '';
    const padM = String(m).padStart(2, '0');
    const padD = String(d).padStart(2, '0');
    return {
      fullText: `${y}.${padM}.${padD}. ${dayName}`,
      datePart: `${y}.${padM}.${padD}.`,
      dayName,
    };
  }, [selectedDate]);

  // 관리자 로그인/로그아웃
  const handleAdminLoginSuccess = () => {
    setIsAdmin(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('aial_is_admin', 'true');
      sessionStorage.setItem('aial_admin_id', 'aaa');
      sessionStorage.setItem('aial_admin_pw', 'bbb');
      localStorage.setItem('aial_is_admin', 'true');
      localStorage.setItem('aial_admin_id', 'aaa');
      localStorage.setItem('aial_admin_pw', 'bbb');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('aial_is_admin');
      sessionStorage.removeItem('aial_admin_id');
      sessionStorage.removeItem('aial_admin_pw');
      localStorage.removeItem('aial_is_admin');
      localStorage.removeItem('aial_admin_id');
      localStorage.removeItem('aial_admin_pw');
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

  // 검색 필터: 전체 기간 대상 목록 (최신순)
  const searchAllMeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return meals
      .filter((m) => {
        if (m.menuName && m.menuName.toLowerCase().includes(q)) return true;
        if (m.comment && m.comment.toLowerCase().includes(q)) return true;
        if (m.aiReview && m.aiReview.toLowerCase().includes(q)) return true;
        if (m.member && m.member.toLowerCase().includes(q)) return true;
        if (m.comments && Array.isArray(m.comments)) {
          if (m.comments.some((c) => !c.isDeleted && c.content && c.content.toLowerCase().includes(q))) return true;
        }
        return false;
      })
      .sort((a, b) => getMealTimestamp(b) - getMealTimestamp(a));
  }, [meals, searchQuery]);

  // 검색 필터: 선택 날짜/슬롯 대상 목록
  const searchDateSlotMeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return currentSlotMeals.filter((m) => {
      if (m.menuName && m.menuName.toLowerCase().includes(q)) return true;
      if (m.comment && m.comment.toLowerCase().includes(q)) return true;
      if (m.aiReview && m.aiReview.toLowerCase().includes(q)) return true;
      if (m.member && m.member.toLowerCase().includes(q)) return true;
      if (m.comments && Array.isArray(m.comments)) {
        if (m.comments.some((c) => !c.isDeleted && c.content && c.content.toLowerCase().includes(q))) return true;
      }
      return false;
    });
  }, [currentSlotMeals, searchQuery]);

  // 화면에 최종 렌더링할 식사 목록
  const displayedMeals = useMemo(() => {
    if (searchQuery.trim()) {
      return searchFilterScope === 'all' ? searchAllMeals : searchDateSlotMeals;
    }
    if (selectedMemberFilter) {
      return filterScope === 'all' ? memberAllMeals : memberDateSlotMeals;
    }
    if (selectedScoreFilter) {
      return scoreFilterScope === 'all' ? scoreAllMeals : scoreDateSlotMeals;
    }
    return currentSlotMeals;
  }, [
    searchQuery,
    searchFilterScope,
    searchAllMeals,
    searchDateSlotMeals,
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

  // BEST SCORE 계산:
  // 역대 출품작 중 최고 득점작 1등부터 3등까지 산출 (동등 점수면 공동 1위, 공동 2위 등 동일 순위 처리)
  const bestScoreData = useMemo<BestScoreInfo | null>(() => {
    const scoredMeals = meals.filter(
      (m): m is MealEntry & { score: number } =>
        typeof m.score === 'number' && !isNaN(m.score) && m.score > 0
    );

    if (scoredMeals.length === 0) return null;

    // 고유 점수 내림차순 정렬 (동점자 동일 순위 처리를 위한 Dense ranking 기준)
    const uniqueScores = Array.from(new Set(scoredMeals.map((m) => m.score))).sort(
      (a, b) => b - a
    );

    // 최고 득점 1등부터 3등까지의 점수 추출
    const top3Scores = uniqueScores.slice(0, 3);
    const tiers: BestScoreInfo['tiers'] = [];
    const allRankedMeals: BestScoreInfo['allRankedMeals'] = [];

    top3Scores.forEach((score, index) => {
      const rank = index + 1; // 1, 2, 3
      const mealsForScore = scoredMeals
        .filter((m) => m.score === score)
        .sort((a, b) => getMealTimestamp(b) - getMealTimestamp(a));

      const isTie = mealsForScore.length > 1;
      const rankText = isTie ? `공동 ${rank}위` : `${rank}위`;

      const rankedMealsForScore = mealsForScore.map((m) => ({
        ...m,
        rank,
        isTie,
        rankText,
      }));

      tiers.push({
        rank,
        score,
        isTie,
        meals: rankedMealsForScore,
      });

      allRankedMeals.push(...rankedMealsForScore);
    });

    if (tiers.length === 0) return null;

    return {
      tiers,
      allRankedMeals,
      topScore: tiers[0]?.score || 0,
      totalRankedMeals: allRankedMeals.length,
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

  // 게시글 조회수 1회 집계 핸들러 (1개 IP당 1회만 카운트)
  const handleRecordMealView = async (mealId: string) => {
    try {
      const resp = await fetch('/api/meals/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId }),
      });
      const data = await resp.json();
      if (data.success && typeof data.views === 'number') {
        const newViews = data.views;
        setMeals((prev) => {
          const updated = prev.map((m) =>
            m.id === mealId ? { ...m, views: newViews } : m
          );
          saveLocalMeals(updated);
          return updated;
        });
        setSelectedDetailMeal((prev) =>
          prev && prev.id === mealId ? { ...prev, views: newViews } : prev
        );
      }
    } catch (e) {
      console.warn('Failed to record view count:', e);
    }
  };

  // 게시글 좋아요 토글 핸들러 (1개 IP당 1회만 카운트, 재클릭 시 취소 토글)
  const handleToggleMealLike = async (mealId: string) => {
    // 1. 현재 로컬 상태 파악 (Optimistic UI)
    const currentMeal = meals.find((m) => m.id === mealId) || selectedDetailMeal;
    const currentLiked = Boolean(
      currentMeal?.hasLiked ||
        (typeof window !== 'undefined' && localStorage.getItem(`aial_meal_liked_${mealId}`) === '1')
    );
    const nextLiked = !currentLiked;
    const currentLikes = currentMeal?.likes || 0;
    const nextLikes = nextLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1);

    if (typeof window !== 'undefined') {
      if (nextLiked) {
        localStorage.setItem(`aial_meal_liked_${mealId}`, '1');
      } else {
        localStorage.removeItem(`aial_meal_liked_${mealId}`);
      }
    }

    setMeals((prev) => {
      const updated = prev.map((m) =>
        m.id === mealId ? { ...m, likes: nextLikes, hasLiked: nextLiked } : m
      );
      saveLocalMeals(updated);
      return updated;
    });

    setSelectedDetailMeal((prev) =>
      prev && prev.id === mealId ? { ...prev, likes: nextLikes, hasLiked: nextLiked } : prev
    );

    // 2. 서버 원자적 반영 요청
    try {
      const resp = await fetch('/api/meals/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId, action: 'toggle' }),
      });
      const data = await resp.json();
      if (data.success && typeof data.likes === 'number') {
        const finalLikes = data.likes;
        const finalLiked = Boolean(data.liked);

        setMeals((prev) => {
          const updated = prev.map((m) =>
            m.id === mealId ? { ...m, likes: finalLikes, hasLiked: finalLiked } : m
          );
          saveLocalMeals(updated);
          return updated;
        });

        setSelectedDetailMeal((prev) =>
          prev && prev.id === mealId ? { ...prev, likes: finalLikes, hasLiked: finalLiked } : prev
        );

        if (typeof window !== 'undefined') {
          if (finalLiked) {
            localStorage.setItem(`aial_meal_liked_${mealId}`, '1');
          } else {
            localStorage.removeItem(`aial_meal_liked_${mealId}`);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to toggle like count:', e);
    }
  };

  // 상세 모달 열기 및 조회수 집계
  const handleOpenMealDetail = (meal: MealEntry) => {
    setSelectedDetailMeal(meal);
    handleRecordMealView(meal.id);
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
    setSearchQuery('');
    setFilterScope('all');
    setScoreFilterScope('all');
    setSearchFilterScope('all');
    const kst = getKSTNow();
    setSelectedDate(kst.date);
    setSelectedSlot(getCurrentMealSlot());
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-x-hidden relative"
      style={{
        transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        transition: isDraggingRef.current
          ? 'none'
          : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      {/* 상단 끌어당겨 새로고침 (Pull to Refresh) 플로팅 뱃지 */}
      {(pullDistance > 0 || isPullRefreshing) && (
        <div
          className="fixed top-2.5 left-0 right-0 z-50 flex justify-center pointer-events-none select-none transition-all duration-150"
          style={{
            transform: `translateY(${Math.max(pullDistance - 50, 0)}px)`,
            opacity: pullDistance > 10 ? Math.min((pullDistance - 10) / 25, 1) : 0,
          }}
        >
          <div
            className={`px-4 py-2 rounded-full backdrop-blur-md shadow-2xl flex items-center space-x-2 text-xs font-bold border transition-all ${
              pullState === 'complete'
                ? 'bg-emerald-950/95 border-emerald-500 text-emerald-300 shadow-emerald-500/30'
                : pullState === 'ready'
                ? 'bg-amber-950/95 border-amber-400 text-amber-200 shadow-amber-500/40 scale-105 ring-2 ring-amber-400/30'
                : pullState === 'refreshing'
                ? 'bg-slate-900/95 border-amber-500/80 text-amber-300 shadow-orange-500/30'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 shadow-slate-950/80'
            }`}
          >
            {pullState === 'complete' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-bounce" />
                <span>새로고침 완료!</span>
              </>
            ) : pullState === 'refreshing' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>최신 식사 데이터 갱신 중...</span>
              </>
            ) : pullState === 'ready' ? (
              <>
                <ArrowDown className="w-4 h-4 text-amber-300 -rotate-180 transition-transform duration-200" />
                <span className="text-amber-200 font-extrabold">손을 놓으면 새로고침</span>
              </>
            ) : (
              <>
                <ArrowDown
                  className="w-4 h-4 text-slate-400 transition-transform duration-100"
                  style={{
                    transform: `rotate(${Math.min((pullDistance / 65) * 180, 180)}deg)`,
                  }}
                />
                <span className="text-slate-300">당겨서 새로고침</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 상단 글로벌 헤더 */}
      <Header
        onOpenNewMeal={() => setIsNewMealOpen(true)}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        onOpenNotice={() => setIsNoticeOpen(true)}
        onOpenHowTo={() => setIsHowToOpen(true)}
        onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
        onAdminLogout={handleAdminLogout}
        onOpenAdminQuiz={() => setIsAdminQuizOpen(true)}
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
              className="relative flex items-center space-x-1.5 bg-slate-950 border border-slate-700 hover:border-amber-500 rounded-xl px-2.5 sm:px-3 py-1.5 transition-colors cursor-pointer shrink-0 group select-none"
              title="클릭하여 달력에서 날짜 선택"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCalendar();
                }}
                className="p-0.5 text-amber-400 group-hover:text-amber-300 transition-colors shrink-0"
              >
                <Calendar className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1 text-xs sm:text-sm font-bold text-white tracking-tight">
                <span>{selectedDateFormatted.datePart}</span>
                <span
                  className={
                    selectedDateFormatted.dayName === '토'
                      ? 'text-blue-400 font-extrabold'
                      : selectedDateFormatted.dayName === '일'
                      ? 'text-rose-400 font-extrabold'
                      : 'text-amber-300 font-extrabold'
                  }
                >
                  {selectedDateFormatted.dayName}
                </span>
              </div>

              {/* 투명한 네이티브 date input (클릭 시 브라우저 달력 팝업 호출) */}
              <input
                ref={dateInputRef}
                type="date"
                min="2020-01-01"
                max="2035-12-31"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10 [color-scheme:dark]"
                title="클릭하여 달력에서 날짜 선택"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(getKSTNow().date);
                }}
                className="relative z-20 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
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
                  setSearchQuery('');
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
                  setSearchQuery('');
                }
              }}
              meals={meals}
            />

            {/* BEST WINNER 버튼 */}
            <button
              type="button"
              onClick={() => setIsBestWinnerOpen(true)}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/60 hover:border-amber-400 text-amber-300 hover:text-amber-100 transition-all text-xs sm:text-sm font-black shadow-sm hover:shadow-amber-500/20 cursor-pointer shrink-0"
              title="최다 WIN 달성 BEST WINNER의 음식들 보기"
            >
              <Trophy className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>BEST WINNER</span>
            </button>

            {/* BEST SCORE 버튼 */}
            <button
              type="button"
              onClick={() => setIsBestScoreOpen(true)}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-rose-500/20 via-pink-500/20 to-amber-500/20 border border-rose-500/60 hover:border-rose-400 text-rose-300 hover:text-rose-100 transition-all text-xs sm:text-sm font-black shadow-sm hover:shadow-rose-500/20 cursor-pointer shrink-0"
              title="역대 최고 득점작 1등~3등 보기"
            >
              <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>BEST SCORE</span>
            </button>

            {/* 검색 버튼 */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border transition-all text-xs sm:text-sm font-black shadow-sm cursor-pointer shrink-0 ${
                searchQuery.trim()
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-cyan-500/30 font-extrabold'
                  : 'bg-gradient-to-r from-cyan-500/20 via-sky-500/20 to-blue-500/20 border-cyan-500/60 hover:border-cyan-400 text-cyan-300 hover:text-cyan-100 hover:shadow-cyan-500/20'
              }`}
              title="제목, 코멘트, 댓글, AI평가 통합 검색"
            >
              <Search className={`w-4 h-4 ${searchQuery.trim() ? 'text-slate-950 font-bold' : 'text-cyan-400'}`} />
              <span>{searchQuery.trim() ? `검색: ${searchQuery.length > 4 ? searchQuery.slice(0, 4) + '…' : searchQuery}` : '검색'}</span>
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

        {/* 2-3. 검색 필터링 안내 배너 (검색어 활성화 시 표시) */}
        {searchQuery.trim() && (
          <div className="p-3.5 sm:p-4 bg-gradient-to-r from-cyan-500/15 via-sky-500/10 to-slate-900 border border-cyan-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fade-in">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 shrink-0">
                <Search className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span className="text-cyan-400 font-extrabold">&quot;{searchQuery}&quot;</span> 검색 결과
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                    총 {displayedMeals.length}건
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {searchFilterScope === 'all'
                    ? `전체 기간의 출품작(제목, 코멘트, 댓글, AI평가) 중에서 "${searchQuery}"가 포함된 게시물입니다.`
                    : `${selectedDate} ${selectedSlot} 타임 출품작 중 검색 결과입니다.`}
                </p>
              </div>
            </div>

            {/* 범위 토글 버튼 및 검색창 다시 열기 / 검색 해제 */}
            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-wrap gap-y-1.5">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSearchFilterScope('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    searchFilterScope === 'all'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  전체 날짜 ({searchAllMeals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterScope('current')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    searchFilterScope === 'current'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  선택 날짜 ({searchDateSlotMeals.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 text-xs font-bold transition-colors shrink-0 cursor-pointer flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                <span>검색창 열기</span>
              </button>

              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                검색 해제 ✕
              </button>
            </div>
          </div>
        )}

        {/* 3. 식사 타임대 탭 (멤버/점수/검색 전체날짜 모아보기가 아닐 때 표시) */}
        {(!selectedMemberFilter || filterScope === 'date') &&
          (!selectedScoreFilter || scoreFilterScope === 'date') &&
          (!searchQuery.trim() || searchFilterScope === 'current') && (
            <MealSlotTabs
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              slotCounts={slotCounts}
              slotWinners={slotWinners}
            />
          )}

        {/* 4. AI 심사 상태 및 우승자 공지 배너 (타임대별 뷰일 때만 표시) */}
        {(!selectedMemberFilter || filterScope === 'date') &&
          (!selectedScoreFilter || scoreFilterScope === 'date') &&
          (!searchQuery.trim() || searchFilterScope === 'current') && (
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
            ) : checkCanRegisterMeal(selectedDate, selectedSlot).canRegister || isAdmin ? (
              <button
                onClick={() => setIsNewMealOpen(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 hover:scale-105 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isAdmin ? '사진 올리기 (관리자)' : '지금 사진 올리기'}</span>
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
                onImageClick={(url, title) => {
                  setViewerImage({ url, title });
                  handleRecordMealView(meal.id);
                }}
                onDetailClick={(target) => handleOpenMealDetail(target)}
                onEdit={(target) => {
                  setAdminTargetMeal(target);
                  setAdminAction('edit');
                }}
                onDelete={(target) => {
                  setAdminTargetMeal(target);
                  setAdminAction('delete');
                }}
                onLike={(mealId) => handleToggleMealLike(mealId)}
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
        isAdmin={isAdmin}
        onAdminLogin={handleAdminLoginSuccess}
        onAdminLogout={handleAdminLogout}
      />

      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        stats={memberWinStats}
        onSelectMemberReward={(member) => {
          setRewardTargetMember(member);
          setIsRewardOpen(true);
        }}
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
          handleOpenMealDetail(meal);
        }}
      />

      <BestScoreModal
        isOpen={isBestScoreOpen}
        onClose={() => setIsBestScoreOpen(false)}
        bestScore={bestScoreData}
        onImageClick={(url, title) => setViewerImage({ url, title })}
        onMealClick={(meal) => {
          setIsBestScoreOpen(false);
          handleOpenMealDetail(meal);
        }}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        meals={meals}
        initialQuery={searchQuery}
        onMealClick={(meal) => {
          setIsSearchOpen(false);
          handleOpenMealDetail(meal);
        }}
        onApplyToMain={(query) => {
          setSearchQuery(query);
          setSearchFilterScope('all');
          setSelectedMemberFilter(null);
          setSelectedScoreFilter(null);
        }}
      />

      <RewardModal
        isOpen={isRewardOpen}
        onClose={() => {
          setIsRewardOpen(false);
          setRewardTargetMember(null);
        }}
        initialMember={rewardTargetMember}
        isAdmin={isAdmin}
        memberWinStats={memberWinStats}
      />

      <AdminQuizModal
        isOpen={isAdminQuizOpen}
        onClose={() => setIsAdminQuizOpen(false)}
      />

      <MealDetailModal
        isOpen={!!selectedDetailMeal}
        onClose={() => setSelectedDetailMeal(null)}
        meal={selectedDetailMeal}
        isAdmin={isAdmin}
        onImageClick={(url, title) => setViewerImage({ url, title })}
        onCommentAdded={handleCommentAdded}
        onCommentDeleted={handleCommentDeleted}
        onLike={(mealId) => handleToggleMealLike(mealId)}
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
