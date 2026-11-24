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
  Loader2,
  Trophy,
  RefreshCw,
  PackagePlus,
} from 'lucide-react';
import { MEMBERS } from '@/constants/members';
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
  const [selectedMember, setSelectedMember] = useState<string>(MEMBERS[0].name);

  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState<boolean>(false);
  const [rewardInitialMember, setRewardInitialMember] = useState<string | null>(null);
  const [rewardStartApply, setRewardStartApply] = useState<boolean>(false);

  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
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

  const handleStartTurn = async () => {
    if (isStarting || isFinishing || activeTurnId || lockedByOther) return;
    setStatusMessage('');
    try {
      setIsStarting(true);
      const resp = await fetch('/api/gacha/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: selectedMember }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setStatusMessage(data.message || '뽑기를 시작할 수 없습니다.');
        await fetchState();
        return;
      }

      if (typeof data.serverNow === 'number') {
        setServerClockOffset(data.serverNow - Date.now());
      }
      setMachine(data.machine);
      if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
      setActiveTurnId(data.turnId);
    } catch (err: any) {
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
          if (Array.isArray(data.wonRecords) && data.wonRecords.length > 0) {
            setActiveWinModal(data.wonRecords[0]);
            setStatusMessage(
              `🎉 축하합니다! ${selectedMember}님이 ${data.wonRecords.map((w: GachaWinRecord) => w.boxLabel).join(', ')}을 뽑았습니다!`
            );
          } else {
            setStatusMessage('상자가 이동되어 모든 플레이어에게 반영되었습니다!');
          }
          await fetchState();
        } else {
          setStatusMessage(data.message || '결과 반영 실패');
          await fetchState();
        }
      } catch (err: any) {
        setStatusMessage('결과 저장 중 오류가 발생했습니다.');
        await fetchState();
      } finally {
        setActiveTurnId(null);
        setIsFinishing(false);
      }
    },
    [activeTurnId, selectedMember, fetchState]
  );

  const handleAdminRefill = async () => {
    const currentCount = machine?.items?.length ?? 0;
    const missingCount = Math.max(0, 4 - currentCount);
    if (missingCount === 0) {
      setStatusMessage('이미 4개 상품이 모두 채워져 있습니다.');
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
                12인 공유 릴레이 크레인 · Bar 사이로 상자를 통과시키면 <strong className="text-amber-300">0.01 SOL</strong> 당첨!
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

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleAdminGrantTicket(1)}
                  disabled={isGranting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                  title="현재 선택된 멤버에게 테스트 뽑기권 +1 지급"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{selectedMember} 티켓 +1</span>
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
        {myAvailableGachaCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-amber-400/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <Gift className="w-5 h-5 text-amber-300 shrink-0 animate-bounce" />
              <div className="text-xs sm:text-sm">
                <strong className="text-white">{selectedMember}</strong>님이 리워드 신청 가능한 당첨 상자가{' '}
                <strong className="text-amber-300">
                  {myAvailableGachaCount}개 ({Number((myAvailableGachaCount * 0.01).toFixed(4))} SOL)
                </strong>{' '}
                있습니다!{' '}
                <span className="text-[11px] text-slate-300">
                  (업비트 입금 시 2개 이상 모아서 신청 권장)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenGachaReward(selectedMember, false)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
            >
              🎁 리워드 신청하기
            </button>
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
            <button
              type="button"
              onClick={fetchState}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>동기화</span>
            </button>
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
          isMyTurn={Boolean(activeTurnId) && !isFinishing}
          lockedByOther={lockedByOther}
          turnKey={activeTurnId}
          onTurnFinish={handleTurnFinish}
          onStartTurnRequest={handleStartTurn}
          canStartTurn={selectedBalance.tickets >= 1 && !activeTurnId && !isFinishing && !lockedByOther}
          selectedMember={selectedMember}
          selectedMemberTickets={selectedBalance.tickets}
          isStarting={isStarting}
          isFinishing={isFinishing}
        />

        {/* 3. 최근 뽑기 당첨 내역 */}
        <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>최근 UFO 뽑기 당첨 현황</span>
            </h2>
            <span className="text-[11px] text-slate-400">당첨 상품: 0.01 SOL</span>
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

      {/* 당첨 축하 폭죽 팝업 */}
      <GachaWinModal
        isOpen={!!activeWinModal}
        onClose={() => setActiveWinModal(null)}
        winRecord={activeWinModal}
      />

      {/* UFO 뽑기 명예의 전당 모달 (식사배틀과 별도 DB) */}
      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        stats={gachaWinStats}
        mode="gacha"
        usedWinsByMember={usedWinsByMember}
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
