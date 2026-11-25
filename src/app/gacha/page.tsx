'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  Ticket,
  RotateCcw,
  ShieldCheck,
  Coins,
  Gift,
  Plus,
  Minus,
  Loader2,
  Trophy,
  RefreshCw,
  PackagePlus,
  ArrowRightLeft,
  Megaphone,
  X,
  Clock,
  Info,
  Camera,
} from 'lucide-react';
import { MEMBERS } from '@/constants/members';
import { GACHA_SLOT_BOX_DIMS, GACHA_SLOT_REWARD_AMOUNTS, GACHA_TOTAL_SLOTS } from '@/constants/gacha';
import { GachaMachineState, GachaTicketBalance, GachaWinRecord } from '@/types/gacha';
import { MemberWinStats } from '@/types/meal';
import { UfoClawMachine3D, TurnFinishPayload } from '@/components/UfoClawMachine3D';
import { GachaWinModal } from '@/components/GachaWinModal';
import { LeaderboardModal } from '@/components/LeaderboardModal';
import { RewardModal } from '@/components/RewardModal';

function formatKstDateTime(ts?: number): string {
  if (!ts) return '';
  const kst = new Date(ts + 9 * 3600 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function GachaPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const [machine, setMachine] = useState<GachaMachineState | null>(null);
  const [ticketsByMember, setTicketsByMember] = useState<Record<string, GachaTicketBalance>>({});
  const [unclaimedWins, setUnclaimedWins] = useState<GachaWinRecord[]>([]);
  const [recentWins, setRecentWins] = useState<GachaWinRecord[]>([]);
  const [gachaWinStats, setGachaWinStats] = useState<MemberWinStats[]>([]);
  const [usedWinsByMember, setUsedWinsByMember] = useState<Record<string, number>>({});
  const [availableGachaSolByMember, setAvailableGachaSolByMember] = useState<Record<string, number>>({});
  const [mealWinSummaryByMember, setMealWinSummaryByMember] = useState<
    Record<string, { actualWins: number; rewardUsedWins: number; exchangedWins: number; availableMealWins: number }>
  >({});
  const [isExchangingWin, setIsExchangingWin] = useState<boolean>(false);
  const [isExchangingSol, setIsExchangingSol] = useState<boolean>(false);
  const [selectedMember, setSelectedMember] = useState<string>(MEMBERS[0].name);

  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [isUfoNoticeOpen, setIsUfoNoticeOpen] = useState<boolean>(false);
  const [selectedNoticeBoxSlot, setSelectedNoticeBoxSlot] = useState<number | null>(null);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState<boolean>(false);
  const [rewardInitialMember, setRewardInitialMember] = useState<string | null>(null);
  const [rewardStartApply, setRewardStartApply] = useState<boolean>(false);

  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [activeTurnKey, setActiveTurnKey] = useState<string | null>(null);
  const [pendingNextTurnKey, setPendingNextTurnKey] = useState<string | null>(null);
  const [sessionProgress, setSessionProgress] = useState<{
    current: number;
    total: number;
    bonusPlays: number;
  } | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);
  const [pendingMultiPlayCount, setPendingMultiPlayCount] = useState<number | null>(null);
  const [startPlayInput, setStartPlayInput] = useState<string>('1');
  const [startModalError, setStartModalError] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [serverClockOffset, setServerClockOffset] = useState<number>(0);
  const [isRefilling, setIsRefilling] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isGranting, setIsGranting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeWinModal, setActiveWinModal] = useState<GachaWinRecord | null>(null);

  // 관리자 세션 확인
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAdmin =
        sessionStorage.getItem('aial_is_admin') === 'true' ||
        localStorage.getItem('aial_is_admin') === 'true' ||
        sessionStorage.getItem('aial_admin_id') === 'aaa' ||
        localStorage.getItem('aial_admin_id') === 'aaa';
      setIsAdmin(Boolean(savedAdmin));

      const savedMem = localStorage.getItem('aial_gacha_member');
      if (savedMem && MEMBERS.some((m) => m.name === savedMem)) {
        setSelectedMember(savedMem);
      }
      setAuthChecked(true);
    }
  }, []);

  const getAdminCreds = () => {
    if (typeof window === 'undefined') return { adminId: 'aaa', adminPw: 'bbb' };
    return {
      adminId: sessionStorage.getItem('aial_admin_id') || localStorage.getItem('aial_admin_id') || 'aaa',
      adminPw: sessionStorage.getItem('aial_admin_pw') || localStorage.getItem('aial_admin_pw') || 'bbb',
    };
  };

  const fetchState = useCallback(async () => {
    try {
      const resp = await fetch(`/api/gacha/state?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await resp.json();
      if (data.success) {
        if (typeof data.serverNow === 'number') {
          setServerClockOffset(data.serverNow - Date.now());
        }
        setMachine(data.machine);
        setTicketsByMember(data.ticketsByMember || {});
        setUnclaimedWins(data.unclaimedWins || []);
        setRecentWins(data.recentWins || []);
        if (Array.isArray(data.gachaWinStats)) {
          setGachaWinStats(data.gachaWinStats);
        }
        if (data.usedWinsByMember) {
          setUsedWinsByMember(data.usedWinsByMember);
        }
        if (data.availableGachaSolByMember) {
          setAvailableGachaSolByMember(data.availableGachaSolByMember);
        }
        if (data.mealWinSummaryByMember) {
          setMealWinSummaryByMember(data.mealWinSummaryByMember);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch gacha state:', e);
    }
  }, []);

  const handleSelectMember = (name: string) => {
    setSelectedMember(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aial_gacha_member', name);
    }
  };

  const selectedBalance = useMemo(() => {
    return ticketsByMember[selectedMember] || {
      member: selectedMember,
      tickets: 0,
      totalEarned: 0,
      totalPlayed: 0,
      totalWins: 0,
      updatedAt: 0,
    };
  }, [ticketsByMember, selectedMember]);

  const myAvailableGachaCount = useMemo(() => {
    const stat = gachaWinStats.find((s) => s.member === selectedMember);
    if (!stat) return 0;
    const used = usedWinsByMember[selectedMember] || 0;
    return Math.max(0, stat.totalWins - used);
  }, [gachaWinStats, usedWinsByMember, selectedMember]);

  const myAvailableGachaSol = useMemo(() => {
    if (typeof availableGachaSolByMember[selectedMember] === 'number') {
      return availableGachaSolByMember[selectedMember];
    }
    return Number((myAvailableGachaCount * 0.01).toFixed(4));
  }, [availableGachaSolByMember, selectedMember, myAvailableGachaCount]);

  const handleOpenGachaReward = (member: string, startApply = false) => {
    setIsLeaderboardOpen(false);
    setRewardInitialMember(member);
    setRewardStartApply(startApply);
    setIsRewardModalOpen(true);
  };

  const lockedByOther = useMemo(() => {
    if (!machine?.lock?.active) return null;
    if (activeTurnId && machine.lock.turnId === activeTurnId) return null;
    const approxServerNow = Date.now() + serverClockOffset;
    if (machine.lock.expiresAt && machine.lock.expiresAt < approxServerNow) return null;
    return machine.lock.member || '다른 멤버';
  }, [machine, activeTurnId, serverClockOffset]);

  const otherSessionProgress = useMemo(() => {
    if (!lockedByOther || !machine?.lock) return null;
    const total = Number(machine.lock.totalPlays) || 1;
    const current = Math.min(total, Math.max(1, Number(machine.lock.shotIndex) || 1));
    if (total <= 1) return null;
    return { current, total };
  }, [lockedByOther, machine]);

  // 상태 폴링: 다른 사람이 진행 중이면 1초마다 빠르게 동기화, 대기 중이면 2초마다 동기화
  // 본인이 턴 시작/진행/저장 중일 때는 폴링 일시 정지하여 로컬 3D 물리/저장 충돌 방지
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (activeTurnId || isStarting || isFinishing) return;
    const intervalMs = lockedByOther ? 1000 : 2000;
    const timer = setInterval(() => {
      fetchState();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeTurnId, isStarting, isFinishing, lockedByOther, fetchState]);

  // 본인 턴 진행 중 8초마다 하트비트 전송 (플레이 도중 락 만료 방지, 비정상 이탈 시 25초 내 자동 해제)
  useEffect(() => {
    if (!activeTurnId) return;
    const hb = setInterval(() => {
      fetch('/api/gacha/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId: activeTurnId, member: selectedMember }),
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(hb);
  }, [activeTurnId, selectedMember]);

  const handleOpenStartModal = () => {
    if (isStarting || isFinishing || activeTurnId || lockedByOther) return;
    if (selectedBalance.tickets < 1) {
      setStatusMessage(`${selectedMember}님의 보유 뽑기권이 부족합니다.`);
      return;
    }
    setStartPlayInput('1');
    setStartModalError('');
    setIsStartModalOpen(true);
  };

  const handleStartTurn = async (requestedPlayCount: number, confirmedMultiWarning = false) => {
    if (isStarting || isFinishing || activeTurnId || lockedByOther) return;
    const maxTickets = selectedBalance.tickets;
    if (!Number.isInteger(requestedPlayCount) || requestedPlayCount < 1) {
      setStartModalError('1 이상의 숫자를 입력해주세요.');
      return;
    }
    if (requestedPlayCount > maxTickets) {
      setStartModalError(`보유 뽑기권(${maxTickets}장)을 초과하여 입력할 수 없습니다.`);
      return;
    }

    // 연속 2회 이상 뽑기 시도 시 브라우저 이탈 무효/티켓 미반환 경고 팝업 노출
    if (requestedPlayCount >= 2 && !confirmedMultiWarning) {
      setPendingMultiPlayCount(requestedPlayCount);
      return;
    }

    setPendingMultiPlayCount(null);
    setStartModalError('');
    setStatusMessage('');
    try {
      setIsStarting(true);
      const resp = await fetch('/api/gacha/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: selectedMember, playCount: requestedPlayCount }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setStartModalError(data.message || '뽑기를 시작할 수 없습니다.');
        setStatusMessage(data.message || '뽑기를 시작할 수 없습니다.');
        await fetchState();
        return;
      }

      if (typeof data.serverNow === 'number') {
        setServerClockOffset(data.serverNow - Date.now());
      }
      setIsStartModalOpen(false);
      setMachine(data.machine);
      if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
      const total = Number(data.totalPlays) || requestedPlayCount;
      const bonus = Number(data.bonusPlays) || 0;
      setSessionProgress({ current: 1, total, bonusPlays: bonus });
      setPendingNextTurnKey(null);
      setActiveTurnId(data.turnId);
      setActiveTurnKey(`${data.turnId}_s1`);
      if (bonus > 0) {
        setStatusMessage(
          `🔥 ${selectedMember}님 연속 ${requestedPlayCount}가챠 시작! (+${bonus}회 무료 보너스 → 총 ${total}회 연속 플레이)`
        );
      } else if (total > 1) {
        setStatusMessage(`🕹️ ${selectedMember}님 ${total}회 연속 뽑기를 시작합니다!`);
      }
    } catch (err: any) {
      setStartModalError(err.message || '뽑기 시작 오류');
      setStatusMessage(err.message || '뽑기 시작 오류');
    } finally {
      setIsStarting(false);
    }
  };

  const handleTurnFinish = useCallback(
    async (payload: TurnFinishPayload) => {
      const turnId = activeTurnId;
      if (!turnId) return;

      // DB에 최종 상자 좌표와 락 해제가 완전히 반영될 때까지 activeTurnId & isFinishing 유지
      setIsFinishing(true);
      let keepSession = false;
      try {
        const resp = await fetch('/api/gacha/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnId,
            member: selectedMember,
            updatedItems: payload.updatedItems,
            wonItemIds: payload.wonItemIds,
            actionSummary: payload.actionSummary,
          }),
        });
        const data = await resp.json();
        if (data.success) {
          if (typeof data.serverNow === 'number') {
            setServerClockOffset(data.serverNow - Date.now());
          }
          setMachine(data.machine);
          if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);

          const hasWon = Array.isArray(data.wonRecords) && data.wonRecords.length > 0;
          if (hasWon) {
            setActiveWinModal(data.wonRecords[0]);
            const refundText =
              data.refundedTickets > 0
                ? ` (상품 완판으로 미사용 뽑기권 ${data.refundedTickets}장 자동 환불)`
                : '';
            setStatusMessage(
              `🎉 축하합니다! ${selectedMember}님이 ${data.wonRecords.map((w: GachaWinRecord) => w.boxLabel).join(', ')}을 뽑았습니다!${refundText}`
            );
          }

          if (data.sessionContinue && data.nextShotIndex > 0) {
            keepSession = true;
            const nextKey = `${turnId}_s${data.nextShotIndex}`;
            const total = Number(data.totalPlays) || 1;
            const bonus = Number(data.bonusPlays) || 0;
            setSessionProgress({
              current: data.nextShotIndex,
              total,
              bonusPlays: bonus,
            });
            if (!hasWon) {
              setStatusMessage(
                `🔥 연속 뽑기 ${data.nextShotIndex}/${total}회차 진행 중!${
                  bonus > 0 && data.nextShotIndex > total - bonus ? ' (🎁 보너스 무료 회차!)' : ''
                }`
              );
              setActiveTurnKey(nextKey);
            } else {
              // 당첨 축하 팝업을 닫은 직후 다음 연속 회차 자동 시작
              setPendingNextTurnKey(nextKey);
            }
          } else {
            if (!hasWon) {
              setStatusMessage('상자가 이동되어 모든 플레이어에게 반영되었습니다!');
            }
            await fetchState();
          }
        } else {
          setStatusMessage(data.message || '결과 반영 실패');
          await fetchState();
        }
      } catch (err: any) {
        setStatusMessage('결과 저장 중 오류가 발생했습니다.');
        await fetchState();
      } finally {
        if (!keepSession) {
          setActiveTurnId(null);
          setActiveTurnKey(null);
          setPendingNextTurnKey(null);
          setSessionProgress(null);
        }
        setIsFinishing(false);
      }
    },
    [activeTurnId, selectedMember, fetchState]
  );

  const handleAdminRefill = async () => {
    const currentCount = machine?.items?.length ?? 0;
    const missingCount = Math.max(0, GACHA_TOTAL_SLOTS - currentCount);
    if (missingCount === 0) {
      setStatusMessage(`이미 ${GACHA_TOTAL_SLOTS}개 상품이 모두 채워져 있습니다.`);
      return;
    }
    if (!confirm(`비어있는 상품 ${missingCount}개를 새로 리필하시겠습니까?`)) return;
    try {
      setIsRefilling(true);
      const { adminId, adminPw } = getAdminCreds();
      const resp = await fetch('/api/gacha/refill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
        body: JSON.stringify({ adminId, adminPw }),
      });
      const data = await resp.json();
      if (data.success) {
        if (data.machine) setMachine(data.machine);
        setActiveTurnId(null);
        setStatusMessage(data.message || '📦 뽑기판 리필이 완료되었습니다.');
      } else {
        setStatusMessage(data.message || '리필 실패');
      }
    } finally {
      setIsRefilling(false);
    }
  };

  const handleAdminReset = async () => {
    const currentCount = machine?.items?.length ?? 0;
    if (currentCount === 0) {
      setStatusMessage('초기화할 남은 상품이 없습니다. [뽑기판 리필] 버튼을 눌러주세요.');
      return;
    }
    if (!confirm(`현재 남아있는 상품 ${currentCount}개만 초기 정위치로 되돌리시겠습니까?`)) return;
    try {
      setIsResetting(true);
      const { adminId, adminPw } = getAdminCreds();
      const resp = await fetch('/api/gacha/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
        body: JSON.stringify({ adminId, adminPw }),
      });
      const data = await resp.json();
      if (data.success) {
        setMachine(data.machine);
        setActiveTurnId(null);
        setStatusMessage(data.message || '🔄 남아있는 상품들을 초기 정위치로 재세팅했습니다.');
      } else {
        setStatusMessage(data.message || '초기화 실패');
      }
    } finally {
      setIsResetting(false);
    }
  };

  const handleExchangeWinForTickets = async () => {
    if (isExchangingWin || activeTurnId) return;
    const summary = mealWinSummaryByMember[selectedMember];
    const actualWins = summary?.actualWins ?? 0;
    const exchangedWins = summary?.exchangedWins ?? 0;
    const availableMealWins = summary?.availableMealWins ?? 0;
    const availAfter = availableMealWins - 1;

    if (availableMealWins < 1) {
      setStatusMessage(
        `${selectedMember}님의 신청 가능 리워드 WIN은 ${availableMealWins}WIN으로 뽑기권 교환이 불가능합니다. (1WIN 이상 필요)`
      );
      return;
    }

    const ok = confirm(
      `[${selectedMember}] 식사배틀 신청 가능 리워드 승점 1WIN을 소모하여 뽑기권 5장으로 교환하시겠습니까?\n\n` +
        `• 식사배틀 총 승수(${actualWins}WIN) 표시는 그대로 유지됩니다.\n` +
        `• 신청 가능 리워드 WIN이 ${availableMealWins}WIN → ${availAfter}WIN으로 1 차감됩니다. (뽑기권과 승수 교환 ${exchangedWins + 1}회 차감)`
    );
    if (!ok) return;

    try {
      setIsExchangingWin(true);
      const resp = await fetch('/api/gacha/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: selectedMember }),
      });
      const data = await resp.json();
      if (data.success) {
        if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
        setStatusMessage(data.message);
        await fetchState();
      } else {
        setStatusMessage(data.message || '승점 교환 실패');
      }
    } catch (err: any) {
      setStatusMessage('승점 교환 중 오류가 발생했습니다.');
    } finally {
      setIsExchangingWin(false);
    }
  };

  const handleExchangeSolForTicket = async () => {
    if (isExchangingSol || activeTurnId) return;
    const availSol = myAvailableGachaSol;
    if (availSol < 0.01) {
      setStatusMessage(
        `${selectedMember}님의 신청 가능 뽑기 리워드(${availSol} SOL)가 부족합니다. (0.01 SOL 이상 필요)`
      );
      return;
    }

    const solAfter = Math.max(0, Math.round((availSol - 0.01) * 10000) / 10000);
    const ok = confirm(
      `[${selectedMember}] 뽑기 리워드 0.01 SOL을 뽑기권 1장으로 교환하시겠습니까?\n\n` +
        `• 신청 가능 뽑기 리워드: ${availSol} SOL → ${solAfter} SOL\n` +
        `• 뽑기권 +1장 즉시 지급`
    );
    if (!ok) return;

    try {
      setIsExchangingSol(true);
      const resp = await fetch('/api/gacha/exchange-sol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: selectedMember, ticketCount: 1 }),
      });
      const data = await resp.json();
      if (data.success) {
        if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
        setStatusMessage(data.message);
        await fetchState();
      } else {
        setStatusMessage(data.message || '뽑기 리워드 교환 실패');
      }
    } catch {
      setStatusMessage('뽑기 리워드 교환 중 오류가 발생했습니다.');
    } finally {
      setIsExchangingSol(false);
    }
  };

  const handleAdminGrantTicket = async (amount: number) => {
    try {
      setIsGranting(true);
      const { adminId, adminPw } = getAdminCreds();
      const resp = await fetch('/api/gacha/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
        body: JSON.stringify({ member: selectedMember, amount, adminId, adminPw }),
      });
      const data = await resp.json();
      if (data.success) {
        if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
        setStatusMessage(data.message);
      } else {
        setStatusMessage(data.message || '티켓 지급 실패');
      }
    } finally {
      setIsGranting(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 상단 내비게이션 헤더 */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-bold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>식사 배틀로 복귀</span>
            </Link>
            <div>
              <h1 className="text-sm sm:text-lg font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>UFO 브릿지 뽑기 (SOL 리워드)</span>
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400">
                12인 공유 릴레이 크레인 · Bar 사이로 상자를 통과시키면 <strong className="text-amber-300">0.003 ~ 0.015 SOL</strong> 당첨!
              </p>
            </div>
          </div>

          {/* 우측 툴바: 명예의 전당(공용) + 관리자 전용 버튼 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsLeaderboardOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-400/50 text-amber-300 hover:text-amber-200 text-xs font-black transition-all shadow-sm cursor-pointer"
              title="UFO 뽑기 명예의 전당 및 리워드(SOL) 신청"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>명예의 전당</span>
            </button>

            <button
              type="button"
              onClick={() => setIsUfoNoticeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-300 hover:text-cyan-200 text-xs font-black transition-all shadow-sm cursor-pointer"
              title="UFO 뽑기 공지사항 보기"
            >
              <Megaphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>UFO 공지</span>
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleAdminGrantTicket(1)}
                  disabled={isGranting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                  title="현재 선택된 멤버에게 뽑기권 +1 지급"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{selectedMember} 티켓 +1</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAdminGrantTicket(-1)}
                  disabled={isGranting || selectedBalance.tickets <= 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-40"
                  title="현재 선택된 멤버의 뽑기권 -1 차감"
                >
                  <Minus className="w-3.5 h-3.5" />
                  <span>티켓 -1</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdminRefill}
                  disabled={isRefilling || isResetting || !!activeTurnId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-black cursor-pointer disabled:opacity-50"
                  title="뽑혀서 비어있는 상품 슬롯만 새로 리필 (4개 모두 뽑혔으면 4개 전부 리필)"
                >
                  {isRefilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackagePlus className="w-3.5 h-3.5" />}
                  <span>뽑기판 리필</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdminReset}
                  disabled={isResetting || isRefilling || !!activeTurnId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-black cursor-pointer disabled:opacity-50"
                  title="각도가 틀어졌을 때 현재 남아있는 상자들만 초기 정위치로 복구"
                >
                  {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>뽑기판 초기화</span>
                </button>

                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  관리자 모드
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 메인 게임 영역 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* 미수령 당첨 리워드 신청 가능 알림 */}
        {myAvailableGachaSol > 0 && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-amber-400/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <Gift className="w-5 h-5 text-amber-300 shrink-0 animate-bounce" />
              <div className="text-xs sm:text-sm">
                <strong className="text-white">{selectedMember}</strong>님이 리워드 신청 가능한 잔고가{' '}
                <strong className="text-amber-300 font-mono">
                  {myAvailableGachaSol} SOL
                </strong>{' '}
                있습니다!{' '}
                <span className="text-[11px] text-slate-300">
                  (업비트 입금 시 0.01 SOL 이상 모아서 신청 권장)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {myAvailableGachaSol >= 0.01 && (
                <button
                  type="button"
                  disabled={isExchangingSol || !!activeTurnId}
                  onClick={handleExchangeSolForTicket}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 font-black text-xs shrink-0 cursor-pointer disabled:opacity-40"
                  title="뽑기 리워드 0.01 SOL을 뽑기권 1장으로 즉시 교환"
                >
                  {isExchangingSol ? '교환 중...' : '🎟️ 0.01 SOL → 1뽑기권'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenGachaReward(selectedMember, false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
              >
                🎁 리워드 신청하기
              </button>
            </div>
          </div>
        )}

        {/* 1. 플레이어 선택 및 보유 티켓 바 (12인 공유) */}
        <section className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-amber-400" />
              <span className="text-xs sm:text-sm font-black text-white">플레이어 선택 & 보유 뽑기권</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                (식사 사진 등록 시 승패 무관하게 뽑기권 5회 자동 적립)
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExchangeSolForTicket}
                disabled={isExchangingSol || !!activeTurnId || myAvailableGachaSol < 0.01}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-[11px] font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="뽑기 리워드 0.01 SOL을 뽑기권 1장으로 교환 (신청 가능 뽑기 리워드가 0.01 SOL 이상일 때만 가능)"
              >
                {isExchangingSol ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Coins className="w-3 h-3 text-emerald-300" />
                )}
                <span>
                  리워드 0.01 SOL → 1뽑기권 교환 (보유 {myAvailableGachaSol} SOL)
                </span>
              </button>
              <button
                type="button"
                onClick={handleExchangeWinForTickets}
                disabled={
                  isExchangingWin ||
                  !!activeTurnId ||
                  (mealWinSummaryByMember[selectedMember]?.availableMealWins ?? 0) < 1
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[11px] font-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="식사배틀 신청 가능 리워드 승점 1WIN을 소모해 뽑기권 5장으로 교환 (신청 가능 WIN이 1 이상일 때만 가능)"
              >
                {isExchangingWin ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-3 h-3 text-purple-300" />
                )}
                <span>
                  승점 1WIN → 뽑기권 5회 교환
                  {mealWinSummaryByMember[selectedMember]
                    ? ` (신청가능 ${mealWinSummaryByMember[selectedMember].availableMealWins}WIN)`
                    : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={fetchState}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>동기화</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MEMBERS.map((m) => {
              const bal = ticketsByMember[m.name]?.tickets ?? 0;
              const isSelected = selectedMember === m.name;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!!activeTurnId}
                  onClick={() => handleSelectMember(m.name)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md scale-[1.02]'
                      : `${m.avatarBg} ${m.borderColor} hover:border-slate-500`
                  }`}
                >
                  <div className="text-xs font-black truncate">{m.name}</div>
                  <div
                    className={`text-[10px] font-mono mt-0.5 ${
                      isSelected ? 'text-slate-900 font-bold' : 'text-slate-300'
                    }`}
                  >
                    🎟️ {bal}장
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 실시간 상태 알림 */}
        {(statusMessage || machine?.lastActionSummary) && (
          <div className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2 flex-wrap">
            <span>
              📢 <strong className="text-cyan-300">최근 상황:</strong>{' '}
              {statusMessage || machine?.lastActionSummary}
            </span>
            {machine?.resetCount ? (
              <span className="text-[10px] text-slate-500 font-mono">초기화 누적 {machine.resetCount}회</span>
            ) : null}
          </div>
        )}

        {/* 2. 3D UFO 크레인 머신 */}
        <UfoClawMachine3D
          items={machine?.items || []}
          isMyTurn={Boolean(activeTurnId) && !isFinishing && !pendingNextTurnKey}
          lockedByOther={lockedByOther}
          turnKey={activeTurnKey}
          onTurnFinish={handleTurnFinish}
          onStartTurnRequest={handleOpenStartModal}
          canStartTurn={selectedBalance.tickets >= 1 && !activeTurnId && !isFinishing && !lockedByOther}
          selectedMember={selectedMember}
          selectedMemberTickets={selectedBalance.tickets}
          isStarting={isStarting}
          isFinishing={isFinishing}
          sessionProgress={sessionProgress}
          otherSessionProgress={otherSessionProgress}
        />

        {/* 3. 최근 뽑기 당첨 내역 */}
        <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>최근 UFO 뽑기 당첨 현황</span>
            </h2>
            <span className="text-[11px] text-slate-400">상자별 당첨 리워드: 0.003 ~ 0.015 SOL</span>
          </div>

          {recentWins.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              아직 뽑기에 성공한 멤버가 없습니다. 첫 번째 당첨의 주인공이 되어보세요!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {recentWins.map((w) => (
                <div
                  key={w.id}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-white">{w.member}</span>
                      <span className="text-slate-300">· {w.boxLabel}</span>
                      {w.createdAt ? (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({formatKstDateTime(w.createdAt)})
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-amber-300 font-mono font-bold flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      <span>{w.rewardAmount} SOL</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenGachaReward(w.member, false)}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-300 font-bold text-[10px] shrink-0 cursor-pointer transition-colors"
                    title="명예의 전당에서 리워드 신청 및 현황 확인"
                  >
                    리워드 현황
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 뽑기 시작 횟수 선택 & 연속 5가챠(+1 무료) 모달 */}
      {isStartModalOpen && (() => {
        const maxTickets = selectedBalance.tickets;
        const parsedInput = parseInt(startPlayInput, 10);
        const validCount =
          !isNaN(parsedInput) && parsedInput >= 1 && parsedInput <= maxTickets
            ? parsedInput
            : null;
        const inputBonus = validCount ? Math.floor(validCount / 5) : 0;
        const inputTotal = validCount ? validCount + inputBonus : 0;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => !isStarting && setIsStartModalOpen(false)}
          >
            <div
              className="bg-slate-900 border border-cyan-500/50 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-black">
                  <Ticket className="w-3.5 h-3.5" />
                  <span>{selectedMember} · 보유 뽑기권 {maxTickets}장</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white pt-1">
                  {maxTickets >= 5
                    ? '연속 5가챠를 진행하겠습니까?'
                    : '몇 회 하시겠습니까?'}
                </h3>
                {maxTickets >= 5 && (
                  <p className="text-xs text-cyan-300 font-bold">
                    (연속 5가챠시 1회 무료지급 → 총 6번 연속 플레이!)
                  </p>
                )}
              </div>

              {/* 보유 뽑기권 5장 이상: 연속 5가챠 (+1회 무료 = 총 6회) 메인 CTA */}
              {maxTickets >= 5 && (
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => handleStartTurn(5)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex flex-col items-center leading-tight gap-0.5"
                >
                  <span>🔥 예! 연속 5가챠 진행 (총 6회)</span>
                  <span className="text-[11px] font-bold text-slate-900/90">
                    뽑기권 5장 사용 + 1회 무료 보너스 지급
                  </span>
                </button>
              )}

              {/* 직접 횟수 입력 (디폴트 1, 보유 수량 초과 입력 원천 차단) */}
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    {maxTickets >= 5 ? '또는 직접 횟수 입력' : '진행할 뽑기 횟수 입력'}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    최대 {maxTickets}회
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxTickets}
                    value={startPlayInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setStartPlayInput('');
                        setStartModalError('');
                        return;
                      }
                      const num = parseInt(raw, 10);
                      if (isNaN(num)) return;
                      if (num > maxTickets) {
                        setStartPlayInput(String(maxTickets));
                        setStartModalError(`보유 뽑기권(${maxTickets}장)을 넘을 수 없습니다.`);
                      } else if (num < 1) {
                        setStartPlayInput('1');
                        setStartModalError('');
                      } else {
                        setStartPlayInput(String(num));
                        setStartModalError('');
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-center text-base font-black text-white font-mono outline-none"
                  />
                  <span className="text-xs font-bold text-slate-400 shrink-0">회</span>
                </div>

                {/* 빠른 선택 버튼 (보유 수량 내) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 2, 3, 4].filter((n) => n <= maxTickets).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setStartPlayInput(String(n));
                        setStartModalError('');
                      }}
                      className={`flex-1 min-w-[48px] py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                        startPlayInput === String(n)
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {n}회
                    </button>
                  ))}
                </div>

                {validCount !== null && inputBonus > 0 && (
                  <p className="text-[11px] text-amber-300 font-bold text-center">
                    🎁 {validCount}장 사용 → 보너스 +{inputBonus}회 무료 (총 {inputTotal}회 연속!)
                  </p>
                )}

                {maxTickets < 5 && (
                  <p className="text-[10px] text-slate-500 text-center">
                    💡 뽑기권 5장 이상 보유 시 연속 5가챠(+1회 무료)를 이용할 수 있습니다.
                  </p>
                )}
              </div>

              {startModalError && (
                <p className="text-xs text-rose-400 font-bold text-center">{startModalError}</p>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => setIsStartModalOpen(false)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={isStarting || validCount === null}
                  onClick={() => validCount !== null && handleStartTurn(validCount)}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-40"
                >
                  {isStarting
                    ? '준비 중...'
                    : validCount
                    ? inputBonus > 0
                      ? `${validCount}장 시작 (총 ${inputTotal}회)`
                      : `${validCount}회 뽑기 시작`
                    : '횟수 입력'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 연속 2회 이상 뽑기 주의 안내 팝업 */}
      {pendingMultiPlayCount !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in"
          onClick={() => !isStarting && setPendingMultiPlayCount(null)}
        >
          <div
            className="bg-slate-900 border border-amber-500/60 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black text-amber-300">연속 뽑기 주의 안내</h3>
              <p className="text-xs sm:text-sm text-white font-bold leading-relaxed break-keep">
                연속 뽑기를 시도합니다. 도중에 브라우져를 나가면 뽑기는 무효가 되고 뽑기권(티켓)은 반환받지 못 합니다.
              </p>
              <p className="text-[11px] text-slate-400">
                (선택한 뽑기권 {pendingMultiPlayCount}장
                {Math.floor(pendingMultiPlayCount / 5) > 0
                  ? ` + 무료 보너스 ${Math.floor(pendingMultiPlayCount / 5)}회 = 총 ${
                      pendingMultiPlayCount + Math.floor(pendingMultiPlayCount / 5)
                    }회 연속`
                  : ` = 총 ${pendingMultiPlayCount}회 연속`}
                )
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isStarting}
                onClick={() => setPendingMultiPlayCount(null)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isStarting}
                onClick={() => handleStartTurn(pendingMultiPlayCount, true)}
                className="py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-orange-500/25 cursor-pointer disabled:opacity-50"
              >
                {isStarting ? '시작 중...' : '확인 · 시작하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 당첨 축하 폭죽 팝업 */}
      <GachaWinModal
        isOpen={!!activeWinModal}
        onClose={() => {
          setActiveWinModal(null);
          if (pendingNextTurnKey) {
            const nextKey = pendingNextTurnKey;
            setPendingNextTurnKey(null);
            setActiveTurnKey(nextKey);
          }
        }}
        winRecord={activeWinModal}
      />

      {/* UFO 뽑기 공지사항 모달 */}
      {isUfoNoticeOpen && (() => {
        const boxSpecs = [
          {
            slot: 0,
            shortName: '1번 프리렌',
            fullName: '프리렌 박스 #1',
            difficulty: '5 / 10 (보통)',
            shortDiff: '난이도 5',
            nameColor: 'text-sky-300',
            badgeColor: 'text-emerald-300',
            activeBorder: 'border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50',
            note: '가볍고 컴팩트하여 회전·기울기 공략이 수월한 입문용 상자',
          },
          {
            slot: 1,
            shortName: '2번 네즈코',
            fullName: '네즈코 박스 #2',
            difficulty: '6 / 10 (중상)',
            shortDiff: '난이도 6',
            nameColor: 'text-pink-300',
            badgeColor: 'text-amber-300',
            activeBorder: 'border-pink-400 bg-pink-500/15 ring-1 ring-pink-400/50',
            note: '표준 규격과 무게의 정석 아케이드 브릿지 밸런스 상자',
          },
          {
            slot: 2,
            shortName: '3번 노엘 실바',
            fullName: '노엘 실바 박스 #3',
            difficulty: '7 / 10 (어려움)',
            shortDiff: '난이도 7',
            nameColor: 'text-blue-300',
            badgeColor: 'text-orange-300',
            activeBorder: 'border-blue-400 bg-blue-500/15 ring-1 ring-blue-400/50',
            note: '두툼하고 길며 묵직해 정밀한 모서리·각도 공략이 필요한 상자',
          },
          {
            slot: 3,
            shortName: '4번 레제',
            fullName: '레제 박스 #4',
            difficulty: '8 / 10 (고난도)',
            shortDiff: '난이도 8',
            nameColor: 'text-purple-300',
            badgeColor: 'text-rose-400',
            activeBorder: 'border-purple-400 bg-purple-500/15 ring-1 ring-purple-400/50',
            note: '중앙 Bar 틈새(0.73) 여유가 좁고 가장 길고 무거운 고난도 마스터 상자',
          },
          {
            slot: 4,
            shortName: '5번 바니카',
            fullName: '바니카 박스 #5',
            difficulty: '6.5 / 10 (중상·정사각)',
            shortDiff: '난이도 6.5',
            nameColor: 'text-rose-300',
            badgeColor: 'text-rose-300',
            activeBorder: 'border-rose-400 bg-rose-500/15 ring-1 ring-rose-400/50',
            note: '정사각형에 가까운 와이드 스페셜 상자! 평면으로는 안 빠지며 옆으로 세우거나 지그시 눌러 넣는 공략이 유효합니다.',
          },
        ] as const;

        const activeSpec =
          selectedNoticeBoxSlot !== null ? boxSpecs[selectedNoticeBoxSlot] : null;
        const activeDims =
          selectedNoticeBoxSlot !== null ? GACHA_SLOT_BOX_DIMS[selectedNoticeBoxSlot] : null;
        const activeReward =
          selectedNoticeBoxSlot !== null
            ? GACHA_SLOT_REWARD_AMOUNTS[selectedNoticeBoxSlot]
            : null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsUfoNoticeOpen(false)}
          >
            <div
              className="bg-slate-900 border border-cyan-500/50 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 bg-gradient-to-r from-cyan-950/70 via-slate-900 to-slate-900 border-b border-cyan-500/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">UFO 공지사항</h2>
                    <p className="text-[11px] text-slate-400">UFO 브릿지 뽑기 운영 안내</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUfoNoticeOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-3 overflow-y-auto">
                {/* 261125 공지 (최신 업데이트) */}
                <div className="rounded-2xl bg-slate-950/90 border border-cyan-500/45 overflow-hidden">
                  <div className="px-4 py-3 bg-cyan-500/15 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-black text-cyan-300">📌 261125 공지</span>
                    <span className="text-[11px] text-slate-400 font-mono">2026-11-25</span>
                  </div>
                  <div className="p-4 space-y-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                    <div className="space-y-2">
                      <p className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>
                          현재 뽑기판은 <strong className="text-cyan-300">5개 상품 확장판</strong>(평균 난이도 <strong className="text-rose-300">6.5 중상</strong>)으로 운영되며, 3·4·5번 신규 캐릭터(노엘 실바·레제·바니카) 및 상자별 차등 난이도·SOL 리워드가 적용되었습니다.
                        </span>
                      </p>
                      <p className="ml-6 text-[11px] sm:text-xs text-cyan-300/90 font-semibold">
                        👇 밑에 상자 번호를 누르면 각각의 상자 스펙을 확인 할 수 있습니다.
                      </p>
                      <div className="ml-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] sm:text-xs">
                        {boxSpecs.map((spec) => {
                          const isSelected = selectedNoticeBoxSlot === spec.slot;
                          const rewardSol = GACHA_SLOT_REWARD_AMOUNTS[spec.slot];
                          return (
                            <button
                              key={spec.slot}
                              type="button"
                              onClick={() =>
                                setSelectedNoticeBoxSlot((prev) =>
                                  prev === spec.slot ? null : spec.slot
                                )
                              }
                              className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-1 text-left transition-all cursor-pointer ${
                                isSelected
                                  ? spec.activeBorder
                                  : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <span className={`${spec.nameColor} font-bold truncate`}>
                                {spec.shortName}
                              </span>
                              <span className={`font-mono font-black ${spec.badgeColor} shrink-0`}>
                                {spec.shortDiff} · {rewardSol} SOL
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* 선택된 상자 상세 스펙 카드 */}
                      {activeSpec && activeDims && activeReward !== null && (
                        <div className="ml-6 p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 space-y-2 animate-fade-in">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                            <span className={`text-xs font-black ${activeSpec.nameColor}`}>
                              📦 {activeSpec.fullName} 스펙
                            </span>
                            <span className="text-[11px] font-mono font-black text-amber-300">
                              {activeReward} SOL
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div className="px-2 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">목표 난이도</span>
                              <span className={`font-black font-mono ${activeSpec.badgeColor}`}>
                                {activeSpec.difficulty}
                              </span>
                            </div>
                            <div className="px-2 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">무게 (Mass)</span>
                              <span className="font-black font-mono text-white">
                                {activeDims.mass}
                              </span>
                            </div>
                            <div className="px-2 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 col-span-2">
                              <span className="text-slate-400 block text-[10px]">
                                규격 — 가로(W) × 높이(H) × 세로 길이(D)
                              </span>
                              <span className="font-black font-mono text-cyan-200">
                                {activeDims.w} × {activeDims.h} × {activeDims.d}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1.5">
                                (중앙 Bar 틈새 0.73)
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-snug">
                            💡 {activeSpec.note}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="flex items-start gap-2">
                      <RefreshCw className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <span>
                        1~5번 상자는 초기 배치·정기 리필·관리자 리필 시 항상 <strong className="text-purple-300">무작위 랜덤 위치</strong>로 배치되며, 반발 튀어오름을 줄여 실제 오락실처럼 <strong className="text-emerald-300">눌러서 Bar 사이에 밀어넣는 공략</strong>이 가능하도록 물리를 개선했습니다.
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <Camera className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <span>
                        항공뷰·측면뷰(우측뷰)에서는 크레인 조작이 불가능하며, 뽑기를 시작하면 <strong className="text-sky-300">자동으로 정면뷰로 전환</strong>되어 진행됩니다. (정면에서 <strong className="text-emerald-300">까치발 업/다운 최대 45°</strong>까지는 조작 가능)
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <Coins className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        뽑기 리워드 신청 시 보유 중인 신청 가능 잔고 내에서 <strong className="text-amber-300">원하는 SOL 수량을 직접 입력</strong>해 신청할 수 있으며, <strong className="text-emerald-300">0.01 SOL당 뽑기권 1회</strong>로도 즉시 교환할 수 있습니다.
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-slate-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        승점 교환은 신청 가능 리워드 WIN(1WIN 이상)만 가능(마이너스 가불 차단)하며, 모든 뽑기 최근 상황은 DB에 로그로 기록됩니다.
                      </span>
                    </p>
                  </div>
                </div>

                {/* 261124 공지 (정기 운영 안내) */}
                <div className="rounded-2xl bg-slate-950/75 border border-slate-800 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300">📌 261124 공지</span>
                    <span className="text-[11px] text-slate-500 font-mono">2026-11-24</span>
                  </div>
                  <div className="p-3.5 space-y-2 text-xs text-slate-300 leading-relaxed font-medium">
                    <p className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        뽑기 상품의 재정렬과 refill은 <strong className="text-amber-300">10:30, 14:00, 23:00</strong>에 자동으로 진행됩니다.
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-slate-400">
                      <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span>
                        불가피한 에러나 억울한 시스템 오류는 관리자에게 요청하면 초기화 해드립니다.
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsUfoNoticeOpen(false)}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* UFO 뽑기 명예의 전당 모달 (식사배틀과 별도 DB) */}
      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        stats={gachaWinStats}
        mode="gacha"
        usedWinsByMember={usedWinsByMember}
        availableSolByMember={availableGachaSolByMember}
        onSelectMemberReward={(member) => handleOpenGachaReward(member, false)}
      />

      {/* UFO 뽑기 리워드 신청(퀴즈+양식) & 지급 현황 모달 (식사배틀과 별도 DB) */}
      <RewardModal
        isOpen={isRewardModalOpen}
        onClose={() => {
          setIsRewardModalOpen(false);
          setRewardStartApply(false);
        }}
        initialMember={rewardInitialMember}
        isAdmin={isAdmin}
        memberWinStats={gachaWinStats}
        mode="gacha"
        initialStartApply={rewardStartApply}
        onApplySuccess={fetchState}
      />
    </div>
  );
}
