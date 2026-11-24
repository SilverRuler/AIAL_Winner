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
} from 'lucide-react';
import { MEMBERS } from '@/constants/members';
import { GachaMachineState, GachaTicketBalance, GachaWinRecord } from '@/types/gacha';
import { UfoClawMachine3D, TurnFinishPayload } from '@/components/UfoClawMachine3D';
import { GachaWinModal } from '@/components/GachaWinModal';

export default function GachaPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const [machine, setMachine] = useState<GachaMachineState | null>(null);
  const [ticketsByMember, setTicketsByMember] = useState<Record<string, GachaTicketBalance>>({});
  const [unclaimedWins, setUnclaimedWins] = useState<GachaWinRecord[]>([]);
  const [recentWins, setRecentWins] = useState<GachaWinRecord[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>(MEMBERS[0].name);

  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
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
        setMachine(data.machine);
        setTicketsByMember(data.ticketsByMember || {});
        setUnclaimedWins(data.unclaimedWins || []);
        setRecentWins(data.recentWins || []);
      }
    } catch (e) {
      console.warn('Failed to fetch gacha state:', e);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const timer = setInterval(() => {
      // 본인이 턴 진행 중일 때는 3D 로컬 물리 상태를 덮어쓰지 않음
      if (!activeTurnId) {
        fetchState();
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [activeTurnId, fetchState]);

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

  const myUnclaimedWins = useMemo(() => {
    return unclaimedWins.filter((w) => w.member === selectedMember);
  }, [unclaimedWins, selectedMember]);

  const lockedByOther = useMemo(() => {
    if (!machine?.lock?.active) return null;
    if (activeTurnId && machine.lock.turnId === activeTurnId) return null;
    if (machine.lock.expiresAt && machine.lock.expiresAt < Date.now()) return null;
    return machine.lock.member || '다른 멤버';
  }, [machine, activeTurnId]);

  const handleStartTurn = async () => {
    if (isStarting || activeTurnId) return;
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
      setActiveTurnId(null);
      if (!turnId) return;

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
          setMachine(data.machine);
          if (data.ticketsByMember) setTicketsByMember(data.ticketsByMember);
          if (Array.isArray(data.wonRecords) && data.wonRecords.length > 0) {
            setActiveWinModal(data.wonRecords[0]);
            setStatusMessage(`🎉 축하합니다! ${selectedMember}님이 상자 뽑기에 성공했습니다!`);
          } else {
            setStatusMessage('상자가 조금 움직였습니다! 이어서 공략하거나 다른 멤버와 협력해보세요.');
          }
          await fetchState();
        } else {
          setStatusMessage(data.message || '결과 반영 실패');
          await fetchState();
        }
      } catch (err: any) {
        setStatusMessage('결과 저장 중 오류가 발생했습니다.');
        await fetchState();
      }
    },
    [activeTurnId, selectedMember, fetchState]
  );

  const handleAdminReset = async () => {
    if (!confirm('정말 뽑기판의 모든 상자 위치를 초기 정위치로 재세팅하시겠습니까?')) return;
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
        setStatusMessage('🔄 관리자 권한으로 뽑기판을 초기 상태로 재세팅했습니다.');
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

          {/* 관리자 전용 툴바 */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
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
                onClick={handleAdminReset}
                disabled={isResetting || !!activeTurnId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-black cursor-pointer disabled:opacity-50"
                title="각도가 틀어졌을 때 모든 상자를 초기 위치로 복구"
              >
                {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>뽑기판 초기화</span>
              </button>

              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                관리자 모드
              </span>
            </div>
          )}
        </div>
      </header>

      {/* 메인 게임 영역 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* 미수령 당첨 상자 알림 */}
        {myUnclaimedWins.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-amber-400/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <Gift className="w-5 h-5 text-amber-300 shrink-0 animate-bounce" />
              <div className="text-xs sm:text-sm">
                <strong className="text-white">{selectedMember}</strong>님이 아직 수령 신청하지 않은{' '}
                <strong className="text-amber-300">{myUnclaimedWins.length}개의 당첨 상자(0.01 SOL)</strong>가 있습니다!
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveWinModal(myUnclaimedWins[0])}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
            >
              🎁 상자 뜯고 SOL 받기
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
          isMyTurn={Boolean(activeTurnId)}
          lockedByOther={lockedByOther}
          turnKey={activeTurnId}
          onTurnFinish={handleTurnFinish}
          onStartTurnRequest={handleStartTurn}
          canStartTurn={selectedBalance.tickets >= 1 && !activeTurnId}
          selectedMember={selectedMember}
          selectedMemberTickets={selectedBalance.tickets}
          isStarting={isStarting}
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
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-white">{w.member}</span>
                      <span className="text-slate-400">· {w.boxLabel}</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-mono font-bold flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      <span>{w.rewardAmount} SOL</span>
                    </div>
                  </div>
                  {w.claimStatus === 'unclaimed' ? (
                    <button
                      type="button"
                      onClick={() => setActiveWinModal(w)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] shrink-0 cursor-pointer"
                    >
                      수령 신청
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0">
                      {w.claimStatus === 'completed' ? '지급 완료' : '텔레그램 신청됨'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 당첨 상자 뜯기 & 지갑 수령 신청 모달 */}
      <GachaWinModal
        isOpen={!!activeWinModal}
        onClose={() => setActiveWinModal(null)}
        winRecord={activeWinModal}
        onClaimSuccess={fetchState}
      />
    </div>
  );
}
