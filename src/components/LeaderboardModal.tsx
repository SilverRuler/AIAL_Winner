'use client';

import React from 'react';
import { X, Trophy, Crown, Flame, Award, Calendar, Coins } from 'lucide-react';
import { MemberWinStats } from '@/types/meal';
import { getMemberInfo } from '@/constants/members';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: MemberWinStats[];
  onSelectMemberReward?: (member: string) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  stats,
  onSelectMemberReward,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/30 shrink-0">
              <Trophy className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
                <span>먀미의 명예의 전당</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  WIN 랭킹
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                멤버를 클릭하면 솔라나(SOL) 리워드 지급 현황을 확인할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onSelectMemberReward && (
              <button
                type="button"
                onClick={() => onSelectMemberReward('all')}
                className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 hover:text-purple-200 text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0"
                title="솔라나(SOL) 리워드 지급 현황 보기"
              >
                <Coins className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">리워드 지급현황</span>
                <span className="sm:hidden">리워드</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 랭킹 목록 */}
        <div className="p-4 sm:p-5 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {stats.map((stat, idx) => {
            const memberInfo = getMemberInfo(stat.member);
            const rank = idx + 1;
            const isFirst = rank === 1 && stat.totalWins > 0;
            const isSecond = rank === 2 && stat.totalWins > 0;
            const isThird = rank === 3 && stat.totalWins > 0;

            return (
              <div
                key={stat.member}
                onClick={() => onSelectMemberReward && onSelectMemberReward(stat.member)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                  isFirst
                    ? 'bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-slate-900 border-amber-500/50 hover:border-amber-400 shadow-md shadow-amber-500/10 ring-1 ring-amber-400/30'
                    : isSecond
                    ? 'bg-slate-800/80 border-slate-600 hover:border-slate-500'
                    : isThird
                    ? 'bg-amber-950/20 border-amber-800/40 hover:border-amber-700/60'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-purple-500/50 hover:bg-slate-800/60'
                }`}
                title={`${stat.member}님의 리워드 지급 현황 보기`}
              >
                {/* 순위 & 멤버 */}
                <div className="flex items-center space-x-3">
                  <div className="w-7 text-center font-black">
                    {isFirst ? (
                      <Crown className="w-5 h-5 text-amber-400 mx-auto fill-amber-400 animate-bounce" />
                    ) : isSecond ? (
                      <span className="text-sm text-slate-300">🥈</span>
                    ) : isThird ? (
                      <span className="text-sm text-amber-600">🥉</span>
                    ) : (
                      <span className="text-xs text-slate-500 font-mono">#{rank}</span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${memberInfo.avatarBg} ${memberInfo.borderColor}`}
                      >
                        {stat.member}
                      </span>
                      {stat.totalWins >= 3 && (
                        <span className="inline-flex items-center text-[10px] text-orange-400 font-semibold gap-0.5">
                          <Flame className="w-3 h-3 fill-orange-400" />
                          미식가
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-purple-400 group-hover:text-purple-300 font-bold flex items-center gap-1 transition-colors pl-0.5">
                      <Coins className="w-3 h-3" />
                      <span>리워드 지급현황 보기 &gt;</span>
                    </div>
                  </div>
                </div>

                {/* 통계 수치 (승리, 등록 수, 승률) */}
                <div className="flex items-center space-x-3 text-right">
                  <div>
                    <div className="text-xs sm:text-sm font-black text-amber-400 flex items-center justify-end space-x-1">
                      <Award className="w-3.5 h-3.5" />
                      <span>{stat.totalWins} WIN</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      총 {stat.totalSubmissions}회 등록 · 승률 {stat.winRate}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 닫기 버튼 */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
