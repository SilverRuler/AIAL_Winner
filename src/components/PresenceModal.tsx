'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Users,
  RefreshCw,
  Monitor,
  Smartphone,
  Gamepad2,
  Utensils,
  Wrench,
  Radio,
  Clock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface PresenceSession {
  ip: string;
  maskedIp: string;
  area: 'main' | 'gacha' | 'maintenance';
  page: string;
  engine?: string;
  machineIndex?: number;
  member?: string;
  isPlaying: boolean;
  deviceType: 'Mobile' | 'PC';
  userAgentShort: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenAgoSec: number;
  staySec: number;
  hits: number;
}

interface PresenceData {
  serverNow: number;
  ttlSec: number;
  totalActive: number;
  playingCount: number;
  byArea: {
    main: number;
    gacha: number;
    maintenance: number;
  };
  sessions?: PresenceSession[];
  isAdmin?: boolean;
}

interface PresenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function formatKstClock(ts?: number): string {
  if (!ts) return '-';
  const d = new Date(ts + 9 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const PresenceModal: React.FC<PresenceModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<PresenceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchPresence = useCallback(async (showSpinner = false) => {
    if (typeof document !== 'undefined' && document.hidden && !showSpinner) return;
    if (showSpinner) setIsLoading(true);
    try {
      const adminId =
        sessionStorage.getItem('aial_admin_id') || localStorage.getItem('aial_admin_id') || '';
      const adminPw =
        sessionStorage.getItem('aial_admin_pw') || localStorage.getItem('aial_admin_pw') || '';

      const resp = await fetch(`/api/presence?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        setErrorMsg(json.message || '동접 현황을 불러오지 못했습니다.');
        return;
      }
      if (!json.isAdmin) {
        setErrorMsg('관리자 인증 정보가 만료되었습니다. 다시 관리자 로그인 해주세요.');
        setData(json);
        return;
      }
      setErrorMsg('');
      setData(json);
    } catch {
      setErrorMsg('네트워크 오류로 동접 현황을 불러오지 못했습니다.');
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchPresence(true);
    const timer = setInterval(() => fetchPresence(false), 3000);
    return () => clearInterval(timer);
  }, [isOpen, fetchPresence]);

  if (!isOpen) return null;

  const sessions = data?.sessions || [];

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-emerald-500/40 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-b border-emerald-500/25 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white truncate">
                  실시간 IP별 동접 현황
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black font-mono shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE · 3초 갱신
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                최근 {data?.ttlSec || 25}초 내 활성 요청 기준 · 기준 시각 {formatKstClock(data?.serverNow)} KST
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchPresence(true)}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
              title="지금 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="px-5 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 border-b border-slate-800/80">
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-emerald-500/35">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>전체 동접 (IP)</span>
            </div>
            <div className="text-xl font-black font-mono text-emerald-300 mt-1">
              {data?.totalActive ?? 0}
              <span className="text-xs font-bold text-slate-400 ml-1">명</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/90 border border-cyan-500/30">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold">
              <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>뽑기방</span>
            </div>
            <div className="text-xl font-black font-mono text-cyan-300 mt-1 flex items-baseline gap-1.5">
              <span>
                {data?.byArea?.gacha ?? 0}
                <span className="text-xs font-bold text-slate-400 ml-0.5">명</span>
              </span>
              {(data?.playingCount ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40 font-sans font-black">
                  조작 {data?.playingCount}
                </span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/90 border border-amber-500/30">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold">
              <Utensils className="w-3.5 h-3.5 text-amber-400" />
              <span>식사배틀</span>
            </div>
            <div className="text-xl font-black font-mono text-amber-300 mt-1">
              {data?.byArea?.main ?? 0}
              <span className="text-xs font-bold text-slate-400 ml-1">명</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/90 border border-rose-500/30">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold">
              <Wrench className="w-3.5 h-3.5 text-rose-400" />
              <span>점검 대기</span>
            </div>
            <div className="text-xl font-black font-mono text-rose-300 mt-1">
              {data?.byArea?.maintenance ?? 0}
              <span className="text-xs font-bold text-slate-400 ml-1">명</span>
            </div>
          </div>
        </div>

        {/* IP별 상세 리스트 */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1">
          {errorMsg ? (
            <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : isLoading && !data ? (
            <div className="py-10 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>접속자 현황을 조회하는 중...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-sm font-bold text-slate-300">현재 활성 접속자가 없습니다.</p>
              <p className="text-xs text-slate-500">
                유저가 식사배틀·뽑기방·점검 페이지에 접속하면 자동으로 표시됩니다.
              </p>
            </div>
          ) : (
            sessions.map((s, idx) => {
              const areaBadgeClass =
                s.area === 'gacha'
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                  : s.area === 'main'
                  ? 'bg-amber-500/15 text-amber-200 border-amber-400/40'
                  : 'bg-rose-500/15 text-rose-200 border-rose-400/40';

              return (
                <div
                  key={s.ip}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    s.isPlaying
                      ? 'bg-amber-950/25 border-amber-400/50 shadow-sm shadow-amber-900/20'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-slate-500">
                        #{idx + 1}
                      </span>
                      <span className="text-xs sm:text-sm font-mono font-black text-emerald-300 tracking-tight">
                        {s.ip}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                        {s.deviceType === 'Mobile' ? (
                          <Smartphone className="w-3 h-3 text-sky-400" />
                        ) : (
                          <Monitor className="w-3 h-3 text-indigo-400" />
                        )}
                        <span>{s.userAgentShort}</span>
                      </span>
                      {s.member ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/45 text-amber-200 text-[10px] font-black">
                          👤 {s.member}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 text-[10px] font-semibold">
                          방문자
                        </span>
                      )}
                      {s.isPlaying && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black animate-pulse">
                          🕹️ 크레인 조작중
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-bold ${areaBadgeClass}`}
                      >
                        {s.page}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>체류 {formatDuration(s.staySec)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 text-[10px] font-mono">
                    <span
                      className={`px-2 py-0.5 rounded-full border font-bold ${
                        s.lastSeenAgoSec <= 5
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {s.lastSeenAgoSec <= 1 ? '방금 활성' : `${s.lastSeenAgoSec}초 전`}
                    </span>
                    <span className="text-slate-500">
                      입장 {formatKstClock(s.firstSeenAt)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400 shrink-0">
          <span>※ 인메모리 집계 (DB 부하 0) · 텔레그램에서 <code>동접</code> 명령어로도 조회 가능</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-colors shrink-0"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
