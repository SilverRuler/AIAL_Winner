'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Flame,
  Award,
  Crown,
  Sparkles,
  Calendar,
  Clock,
  ExternalLink,
  MessageSquare,
  Trophy,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BestScoreInfo, MealEntry, RankedScoreMeal } from '@/types/meal';
import { getMemberInfo, isLegacyEvaluation } from '@/constants/members';

interface BestScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  bestScore: BestScoreInfo | null;
  onImageClick?: (url: string, title: string) => void;
  onMealClick?: (meal: MealEntry) => void;
}

export const BestScoreModal: React.FC<BestScoreModalProps> = ({
  isOpen,
  onClose,
  bestScore,
  onImageClick,
  onMealClick,
}) => {
  const [selectedRankTab, setSelectedRankTab] = useState<'all' | number>('all');

  // 모달 오픈 시 화려한 불꽃/축하 콘페티 효과
  useEffect(() => {
    if (isOpen && bestScore && bestScore.totalRankedMeals > 0) {
      confetti({
        particleCount: 65,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#f43f5e', '#fb7185', '#fbbf24', '#f59e0b', '#38bdf8'],
      });
    }
  }, [isOpen, bestScore]);

  // ESC 키로 닫기 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 모달 열릴 때 탭 리셋
  useEffect(() => {
    if (isOpen) {
      setSelectedRankTab('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 필터링된 출품작 목록
  const displayedMeals: RankedScoreMeal[] = bestScore
    ? selectedRankTab === 'all'
      ? bestScore.allRankedMeals
      : bestScore.allRankedMeals.filter((m) => m.rank === selectedRankTab)
    : [];

  // 순위별 스타일 헬퍼 (1위: 골드, 2위: 실버, 3위: 브론즈)
  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          bannerBg: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
          cardBorder: 'border-amber-500/60 shadow-lg shadow-amber-500/15',
          icon: '👑',
          label: '1위',
          medalName: '골드 트로피',
        };
      case 2:
        return {
          bannerBg: 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 text-slate-950',
          badgeBg: 'bg-slate-300/20 text-slate-200 border-slate-300/50',
          cardBorder: 'border-slate-400/50 shadow-md shadow-slate-400/10',
          icon: '🥈',
          label: '2위',
          medalName: '실버 메달',
        };
      case 3:
      default:
        return {
          bannerBg: 'bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 text-white',
          badgeBg: 'bg-orange-600/20 text-orange-300 border-orange-500/50',
          cardBorder: 'border-orange-500/40 shadow-md shadow-orange-500/10',
          icon: '🥉',
          label: '3위',
          medalName: '브론즈 메달',
        };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-950 border border-rose-500/40 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-auto cursor-default flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 화려한 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-rose-950/80 via-slate-900 to-amber-950/70 border-b border-rose-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 flex items-center justify-center shadow-lg shadow-rose-500/30 ring-2 ring-rose-400/50 shrink-0">
              <Flame className="w-6 h-6 text-slate-950 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-pink-200 to-amber-300">
                  BEST SCORE
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] sm:text-xs font-black flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-rose-400" />
                  역대 최고 득점 TOP 3
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                AI 미식 심사위원단으로부터 최고점을 획득한 명예의 요리들
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
          {!bestScore || bestScore.totalRankedMeals === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Award className="w-14 h-14 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-base font-bold text-white">아직 점수가 등록된 출품작이 없습니다.</p>
                <p className="text-xs text-slate-500">
                  식사 사진을 올리고 AI 심사가 완료되면 최고 득점작 순위가 집계됩니다.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 상단 순위 요약 그리드 (1등 ~ 3등 요약) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {bestScore.tiers.map((tier) => {
                  const style = getRankStyle(tier.rank);
                  const isSelected = selectedRankTab === tier.rank;

                  return (
                    <button
                      key={tier.rank}
                      type="button"
                      onClick={() =>
                        setSelectedRankTab((prev) => (prev === tier.rank ? 'all' : tier.rank))
                      }
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? `${style.cardBorder} bg-slate-900/90 ring-2 ring-rose-400/50`
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-2xl shrink-0">{style.icon}</span>
                        <div className="truncate">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-black text-white">
                              {tier.isTie ? `공동 ${tier.rank}위` : `${tier.rank}위`}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({tier.meals.length}작품)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {tier.meals.map((m) => m.member).join(', ')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base sm:text-lg font-black text-amber-300 font-mono">
                          {tier.score}점
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 탭 셀렉터 (전체 및 순위별 빠른 필터) */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1.5 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setSelectedRankTab('all')}
                    className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer shrink-0 ${
                      selectedRankTab === 'all'
                        ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 shadow-md shadow-rose-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    전체 보기 ({bestScore.totalRankedMeals})
                  </button>

                  {bestScore.tiers.map((tier) => {
                    const style = getRankStyle(tier.rank);
                    const isTabActive = selectedRankTab === tier.rank;

                    return (
                      <button
                        key={tier.rank}
                        type="button"
                        onClick={() => setSelectedRankTab(tier.rank)}
                        className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                          isTabActive
                            ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 shadow-md shadow-rose-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>{style.icon}</span>
                        <span>
                          {tier.isTie ? `공동 ${tier.rank}위` : `${tier.rank}위`} ({tier.score}점 · {tier.meals.length})
                        </span>
                      </button>
                    );
                  })}
                </div>

                <span className="text-[11px] text-slate-500 hidden sm:inline shrink-0">
                  * 동등 점수는 모두 공동 순위로 표시
                </span>
              </div>

              {/* 출품작 카드 그리드 */}
              {displayedMeals.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  해당 순위에 해당하는 출품작이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {displayedMeals.map((m) => {
                    const style = getRankStyle(m.rank);
                    const memberInfo = getMemberInfo(m.member);

                    return (
                      <div
                        key={m.id}
                        className={`relative rounded-2xl overflow-hidden border flex flex-col transition-all bg-slate-900/90 ${style.cardBorder}`}
                      >
                        {/* 카드 상단 순위 & 점수 배너 */}
                        <div
                          className={`${style.bannerBg} px-3.5 py-1.5 flex items-center justify-between text-xs font-black`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <span className="text-sm">{style.icon}</span>
                            <span>{m.rankText}</span>
                            {m.isWinner && (
                              <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-bold">
                                {isLegacyEvaluation(m.date, m.slot) ? '👑 (구) WIN' : '👑 WIN'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1">
                            <Flame className="w-3.5 h-3.5" />
                            <span className="font-mono text-sm tracking-tight">
                              맛 점수 {m.score}점
                            </span>
                          </div>
                        </div>

                        {/* 음식 이미지 영역 */}
                        <div
                          onClick={() =>
                            onImageClick?.(m.imageUrl, `${m.member}님의 ${m.menuName}`)
                          }
                          className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950 cursor-pointer group"
                        >
                          <img
                            src={m.imageUrl}
                            alt={m.menuName}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 opacity-50 group-hover:opacity-30 transition-opacity" />

                          {/* 좌측 상단: 멤버 칩 뱃지 */}
                          {memberInfo && (
                            <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 px-2 py-1 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 shadow-md">
                              <div
                                className={`w-5 h-5 rounded-lg ${memberInfo.avatarBg} ${memberInfo.textColor} border ${memberInfo.borderColor} flex items-center justify-center text-[10px] font-black shrink-0`}
                              >
                                {memberInfo.name.slice(0, 1)}
                              </div>
                              <span className="text-xs font-bold text-white">
                                {memberInfo.name}
                              </span>
                            </div>
                          )}

                          {/* 우측 상단: 날짜 & 타임 뱃지 */}
                          <div className="absolute top-2.5 right-2.5 flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[10px] text-slate-300 font-mono border border-white/10">
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
                          <div className="space-y-1.5">
                            <h4 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug line-clamp-1">
                              {m.menuName}
                            </h4>

                            {m.comment && (
                              <p className="text-xs text-slate-300 italic line-clamp-2 bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
                                &quot;{m.comment}&quot;
                              </p>
                            )}

                            {m.aiReview && (
                              <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded-xl">
                                <div className="text-[10px] text-rose-300 font-bold flex items-center gap-1 mb-0.5">
                                  <Sparkles className="w-3 h-3 text-rose-400" />
                                  <span>AI 미식 심사평</span>
                                </div>
                                <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                                  {m.aiReview}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* 카드 하단 액션 */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                            {onMealClick ? (
                              <button
                                type="button"
                                onClick={() => onMealClick(m)}
                                className="inline-flex items-center space-x-1 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer text-[11px] font-semibold"
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
                              onClick={() =>
                                onImageClick?.(m.imageUrl, `${m.member}님의 ${m.menuName}`)
                              }
                              className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="사진 확대"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-400 text-center sm:text-left">
            * 역대 등록된 모든 출품작 중 AI 맛 점수 상위 1위~3위 작품이며, 동점인 경우 모두 공동 순위로 인정됩니다.
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
