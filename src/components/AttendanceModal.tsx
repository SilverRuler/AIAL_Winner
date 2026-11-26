'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  X,
  CalendarCheck,
  Clock,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { MEMBERS } from '@/constants/members';
import { fireSafeConfetti } from '@/lib/confetti';

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AttendanceState {
  serverNow: number;
  kstDate: string;
  kstTime: string;
  activeWindow: 'morning' | 'afternoon' | null;
  activeWindowLabel: string | null;
  nextWindowLabel: string;
  rewardTickets: number;
  claimedMorning: string[];
  claimedAfternoon: string[];
}

function getLiveKstInfo(nowMs: number) {
  const kst = new Date(nowMs + 9 * 3600 * 1000);
  const hh = kst.getUTCHours();
  const mi = kst.getUTCMinutes();
  const ss = kst.getUTCSeconds();
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  let activeWindow: 'morning' | 'afternoon' | null = null;
  let activeWindowLabel: string | null = null;
  if (hh === 9 && mi >= 0 && mi <= 10) {
    activeWindow = 'morning';
    activeWindowLabel = '오전 출석 (09:00~09:10)';
  } else if (hh === 15 && mi >= 0 && mi <= 10) {
    activeWindow = 'afternoon';
    activeWindowLabel = '오후 출석 (15:00~15:10)';
  }
  return { timeStr, activeWindow, activeWindowLabel };
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({ isOpen, onClose }) => {
  const [state, setState] = useState<AttendanceState | null>(null);
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchState = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`/api/attendance?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setState(data);
        if (typeof data.serverNow === 'number') {
          setClockOffset(data.serverNow - Date.now());
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aial_gacha_member') || '';
      if (saved && MEMBERS.some((m) => m.name === saved)) {
        setSelectedMember(saved);
      }
    }
    fetchState();
  }, [isOpen, fetchState]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  const liveInfo = useMemo(() => getLiveKstInfo(tickNow + clockOffset), [tickNow, clockOffset]);

  const activeWindow = liveInfo.activeWindow;
  const activeClaimedList =
    activeWindow === 'morning'
      ? state?.claimedMorning || []
      : activeWindow === 'afternoon'
      ? state?.claimedAfternoon || []
      : [];
  const isSelectedAlreadyClaimed = Boolean(
    selectedMember && activeWindow && activeClaimedList.includes(selectedMember)
  );
  const canClaim = Boolean(activeWindow && selectedMember && !isSelectedAlreadyClaimed && !isClaiming);

  const handleClaim = useCallback(async () => {
    if (!selectedMember) {
      setFeedback({ type: 'error', text: '보상을 받을 유저 닉네임을 먼저 선택해주세요.' });
      return;
    }
    setIsClaiming(true);
    setFeedback(null);
    try {
      const resp = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: selectedMember }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setFeedback({ type: 'success', text: data.message });
        if (typeof window !== 'undefined') {
          localStorage.setItem('aial_gacha_member', selectedMember);
        }
        setState((prev) =>
          prev
            ? {
                ...prev,
                claimedMorning: data.claimedMorning || prev.claimedMorning,
                claimedAfternoon: data.claimedAfternoon || prev.claimedAfternoon,
              }
            : prev
        );
        fireSafeConfetti({
          particleCount: 80,
          spread: 75,
          origin: { y: 0.6 },
        });
      } else {
        setFeedback({ type: 'error', text: data.message || '출석보상 수령에 실패했습니다.' });
        fetchState();
      }
    } catch {
      setFeedback({ type: 'error', text: '네트워크 오류가 발생했습니다.' });
    } finally {
      setIsClaiming(false);
    }
  }, [selectedMember, fetchState]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (feedback?.type === 'success') {
          e.preventDefault();
          onClose();
        } else if (canClaim) {
          e.preventDefault();
          handleClaim();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, canClaim, handleClaim, feedback]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-amber-500/45 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 border-b border-amber-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">타임 출석보상</h2>
              <p className="text-[11px] text-slate-400">
                매일 09:00~09:10 · 15:00~15:10 접속 시 뽑기권 +3장!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={fetchState}
              disabled={isLoading}
              className="p-2 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* 현재 KST 시각 & 수령 가능 여부 배너 */}
          <div
            className={`p-3.5 rounded-2xl border space-y-1.5 ${
              activeWindow
                ? 'bg-emerald-500/15 border-emerald-400/50'
                : 'bg-slate-950/90 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black flex items-center gap-1.5">
                <Clock className={`w-3.5 h-3.5 ${activeWindow ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className={activeWindow ? 'text-emerald-300' : 'text-slate-200'}>
                  현재 시각 (KST)
                </span>
              </span>
              <span className="text-sm font-mono font-black text-white">{liveInfo.timeStr}</span>
            </div>

            {activeWindow ? (
              <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>
                  {liveInfo.activeWindowLabel} 진행 중! 닉네임 선택 후 뽑기권 +3장을 받으세요.
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 leading-relaxed">
                현재는 출석보상 시간이 아닙니다.
                <br />
                <strong className="text-amber-300">오전 09:00~09:10</strong> 또는{' '}
                <strong className="text-amber-300">오후 15:00~15:10</strong> 사이에 다시 접속해주세요!
              </div>
            )}
          </div>

          {/* 12인 유저 닉 선택 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white">1. 보상을 받을 유저 닉네임 선택</span>
              <span className="text-[10px] text-slate-400">타임당 1회 수령</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {MEMBERS.map((m) => {
                const isSelected = selectedMember === m.name;
                const claimedMorning = state?.claimedMorning?.includes(m.name);
                const claimedAfternoon = state?.claimedAfternoon?.includes(m.name);
                const claimedActive = activeWindow
                  ? activeWindow === 'morning'
                    ? claimedMorning
                    : claimedAfternoon
                  : false;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMember(m.name);
                      setFeedback(null);
                    }}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md scale-[1.02]'
                        : claimedActive
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : `${m.avatarBg} ${m.borderColor} hover:border-slate-500`
                    }`}
                  >
                    <div className="text-xs font-black truncate">{m.name}</div>
                    <div
                      className={`text-[9px] font-bold mt-0.5 ${
                        isSelected ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {claimedActive
                        ? '✅ 수령완료'
                        : claimedMorning || claimedAfternoon
                        ? `${claimedMorning ? '오전✓' : ''}${claimedMorning && claimedAfternoon ? ' ' : ''}${claimedAfternoon ? '오후✓' : ''}`
                        : '선택'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 결과 피드백 */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* 보상 받기 버튼 */}
          <button
            type="button"
            disabled={!canClaim}
            onClick={handleClaim}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isClaiming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>지급 중...</span>
              </>
            ) : !activeWindow ? (
              <>
                <Clock className="w-4 h-4" />
                <span>출석 시간(09:00~09:10 · 15:00~15:10) 대기 중</span>
              </>
            ) : !selectedMember ? (
              <>
                <Ticket className="w-4 h-4" />
                <span>위에서 유저 닉네임을 선택하세요</span>
              </>
            ) : isSelectedAlreadyClaimed ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{selectedMember}님 이미 이번 타임 수령 완료</span>
              </>
            ) : (
              <>
                <Ticket className="w-4 h-4" />
                <span>🎁 {selectedMember}님 보상 받기 (뽑기권 +3장)</span>
              </>
            )}
          </button>

          {/* 오늘 출석 현황 요약 */}
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-slate-400 font-bold">오전 09:00~09:10</div>
              <div className="text-amber-300 font-mono font-black mt-0.5">
                {state?.claimedMorning?.length ?? 0}명 수령
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-slate-400 font-bold">오후 15:00~15:10</div>
              <div className="text-cyan-300 font-mono font-black mt-0.5">
                {state?.claimedAfternoon?.length ?? 0}명 수령
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
