'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Trophy,
  Crown,
  Sparkles,
  Calendar,
  Clock,
  ExternalLink,
  Award,
  MessageSquare,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BestWinnerInfo, MealEntry } from '@/types/meal';
import { getMemberInfo, getWinnerHeaderText } from '@/constants/members';

interface BestWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  bestWinner: BestWinnerInfo | null;
  onImageClick?: (url: string, title: string) => void;
  onMealClick?: (meal: MealEntry) => void;
}

export const BestWinnerModal: React.FC<BestWinnerModalProps> = ({
  isOpen,
  onClose,
  bestWinner,
  onImageClick,
  onMealClick,
}) => {
  const [activeTab, setActiveTab] = useState<'winning' | 'all'>('winning');

  // 모달 오픈 시 축하 콘페티 효과
  useEffect(() => {
    if (isOpen && bestWinner) {
      confetti({
        particleCount: 60,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#fbbf24', '#f97316', '#e11d48', '#38bdf8'],
      });
    }
  }, [isOpen, bestWinner]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 모달이 열릴 때 기본 탭은 항상 'winning'으로 리셋
  useEffect(() => {
    if (isOpen) {
      setActiveTab('winning');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const memberInfo = bestWinner ? getMemberInfo(bestWinner.member) : null;
  const displayedMeals = bestWinner
    ? activeTab === 'winning'
      ? bestWinner.winningMeals
      : bestWinner.allMeals
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-950 border border-amber-500/40 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-auto cursor-default flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 골드 글로우 그라데이션 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border-b border-amber-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/30 ring-2 ring-amber-300/50 shrink-0">
              <Crown className="w-6 h-6 text-slate-950 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400">
                  BEST WINNER
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] sm:text-xs font-black flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  최다 WIN 챔피언
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                AIAL 식사 배틀 최다 우승(WIN)을 달성한 명예의 주인공
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {!bestWinner ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Trophy className="w-14 h-14 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-base font-bold text-white">아직 우승(WIN)을 차지한 멤버가 없습니다.</p>
                <p className="text-xs text-slate-500">
                  식사 배틀에서 첫 번째 타임 우승자가 나오면 BEST WINNER가 선정됩니다.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* BEST WINNER 멤버 프로필 요약 카드 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-amber-500/40 shadow-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3.5">
                    {memberInfo && (
                      <div
                        className={`w-12 h-12 rounded-2xl ${memberInfo.avatarBg} ${memberInfo.textColor} border ${memberInfo.borderColor} flex items-center justify-center font-black text-base shrink-0 shadow-md ring-2 ring-amber-400/30`}
                      >
                        {memberInfo.name.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-lg sm:text-xl font-black text-white">
                          {bestWinner.member}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-black shadow-sm">
                          👑 BEST WINNER
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1 flex-wrap gap-y-1">
                        <span className="font-semibold text-amber-300">
                          총 {bestWinner.winCount}회 우승
                        </span>
                        <span>·</span>
                        <span>승률 {bestWinner.winRate}%</span>
                        <span>·</span>
                        <span>총 {bestWinner.totalSubmissions}회 등록</span>
                        {bestWinner.latestWinDate && (
                          <>
                            <span>·</span>
                            <span className="text-slate-300">
                              최근 WIN: {bestWinner.latestWinDate.substring(5)} ({bestWinner.latestWinSlot})
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 우승 횟수 뱃지 */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-400/60 shadow-lg shrink-0 self-start sm:self-auto">
                    <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
                    <div>
                      <div className="text-[10px] text-amber-300 font-bold leading-none">최다 우승</div>
                      <div className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 leading-tight">
                        {bestWinner.winCount}회 WIN
                      </div>
                    </div>
                  </div>
                </div>

                {/* 동률 발생 시 안내 배너 */}
                {bestWinner.isTieBreaker && (
                  <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center space-x-2 text-xs text-amber-200">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>동률 우선 규칙 적용:</strong> 최다 WIN 개수가 동일하여, <strong>가장 마지막에 WIN을 획득</strong>한 {bestWinner.member}님이 BEST WINNER로 선정되었습니다!
                    </span>
                  </div>
                )}
              </div>

              {/* 음식 탭 셀렉터: 우승 음식 vs 전체 등록 음식 */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1.5 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('winning')}
                    className={`px-3.5 py-1.5 rounded-xl font-black transition-all cursor-pointer flex items-center space-x-1.5 ${
                      activeTab === 'winning'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>우승 음식들 ({bestWinner.winningMeals.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-3.5 py-1.5 rounded-xl font-black transition-all cursor-pointer flex items-center space-x-1.5 ${
                      activeTab === 'all'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>전체 등록한 음식들 ({bestWinner.allMeals.length})</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  {bestWinner.member}님의 미식 컬렉션
                </span>
              </div>

              {/* 음식 카드 그리드 */}
              {displayedMeals.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  등록된 음식이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {displayedMeals.map((m) => (
                    <div
                      key={m.id}
                      className={`relative rounded-2xl overflow-hidden border flex flex-col transition-all bg-slate-900/90 ${
                        m.isWinner
                          ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* 카드 상단 배너 */}
                      {m.isWinner ? (
                        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-3 py-1 flex items-center justify-between text-slate-950 font-black text-xs">
                          <div className="flex items-center space-x-1">
                            <Crown className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                            <span>{getWinnerHeaderText(m.date, m.slot)}</span>
                          </div>
                          {m.score !== undefined && (
                            <span className="bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                              맛 점수 {m.score}점
                            </span>
                          )}
                        </div>
                      ) : m.score !== undefined ? (
                        <div className="bg-slate-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>AI 미식 심사완료</span>
                          <span className="text-amber-300 font-bold font-mono">
                            맛 점수 {m.score}점
                          </span>
                        </div>
                      ) : null}

                      {/* 이미지 영역 */}
                      <div
                        onClick={() => onImageClick?.(m.imageUrl, `${m.member}님의 ${m.menuName}`)}
                        className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950 cursor-pointer group"
                      >
                        <img
                          src={m.imageUrl}
                          alt={m.menuName}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 opacity-50 group-hover:opacity-30 transition-opacity" />

                        {/* 날짜 & 타임 뱃지 */}
                        <div className="absolute top-2.5 right-2.5 flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[10px] text-slate-300 font-mono">
                          <span>{m.date.substring(5)}</span>
                          <span className="text-amber-400 font-bold">{m.slot}</span>
                          {m.time && <span>{m.time}</span>}
                        </div>

                        {/* 확대 안내 오버레이 */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                          <span className="text-[11px] bg-slate-900/90 text-white font-medium px-2.5 py-1 rounded-full border border-slate-700 shadow-md">
                            🔍 사진 크게보기
                          </span>
                        </div>
                      </div>

                      {/* 카드 본문 */}
                      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                        <div className="space-y-1">
                          <h4 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug line-clamp-1">
                            {m.menuName}
                          </h4>

                          {m.comment && (
                            <p className="text-xs text-slate-300 italic line-clamp-2 bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                              &quot;{m.comment}&quot;
                            </p>
                          )}

                          {m.aiReview && (
                            <p className="text-[11px] text-slate-400 line-clamp-2 pt-0.5 leading-relaxed">
                              {m.aiReview}
                            </p>
                          )}
                        </div>

                        {/* 카드 하단 액션 */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          {onMealClick ? (
                            <button
                              type="button"
                              onClick={() => onMealClick(m)}
                              className="inline-flex items-center space-x-1 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer text-[11px] font-semibold"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>댓글 {m.comments?.length || 0}개 · 상세보기 &gt;</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center space-x-1 text-slate-400 text-[11px]">
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>댓글 {m.comments?.length || 0}개</span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => onImageClick?.(m.imageUrl, `${m.member}님의 ${m.menuName}`)}
                            className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-400 text-center sm:text-left">
            * 최다 WIN을 달성한 멤버가 BEST WINNER가 되며, 동점 시 가장 마지막에 WIN을 획득한 멤버가 선정됩니다.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};