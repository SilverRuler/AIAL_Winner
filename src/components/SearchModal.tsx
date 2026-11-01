'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  MessageSquare,
  Sparkles,
  Calendar,
  Clock,
  Crown,
  Award,
  ExternalLink,
  Tag,
  Flame,
  ArrowUpDown,
} from 'lucide-react';
import { MealEntry } from '@/types/meal';
import { getMemberInfo } from '@/constants/members';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  meals: MealEntry[];
  initialQuery?: string;
  onMealClick?: (meal: MealEntry) => void;
  onApplyToMain?: (query: string) => void;
}

interface MatchResult {
  meal: MealEntry;
  matchedFields: ('menuName' | 'comment' | 'aiReview' | 'comments' | 'member')[];
  matchedReplies: { author: string; content: string }[];
}

// 특수문자 정규식 이스케이프
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 키워드 하이라이트 헬퍼
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!text || !query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={index}
        className="bg-cyan-500/30 text-cyan-200 font-extrabold px-1 py-0.5 rounded border border-cyan-400/40"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// 타임스탬프 계산 헬퍼
function getMealTime(m: MealEntry): number {
  if (typeof m.createdAt === 'number') return m.createdAt;
  if (typeof m.createdAt === 'string') {
    const parsed = new Date(m.createdAt).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  meals,
  initialQuery = '',
  onMealClick,
  onApplyToMain,
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [sortBy, setSortBy] = useState<'latest' | 'score'>('latest');
  const inputRef = useRef<HTMLInputElement>(null);

  // 인기/추천 검색 키워드 칩
  const popularKeywords = ['탕수육', '소고기', '치킨', '순대국', '라면', '삼겹살', '커피', '피자'];

  // 모달 열릴 때 포커스 및 초기 검색어 동기화
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialQuery]);

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

  // 검색 결과 계산 (제목, 코멘트, 댓글, AI평가총평, 작성자 전체 검색)
  const searchResults = useMemo<MatchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matches: MatchResult[] = [];

    for (const meal of meals) {
      const matchedFields: ('menuName' | 'comment' | 'aiReview' | 'comments' | 'member')[] = [];
      const matchedReplies: { author: string; content: string }[] = [];

      // 1. 제목 (메뉴명)
      if (meal.menuName && meal.menuName.toLowerCase().includes(q)) {
        matchedFields.push('menuName');
      }

      // 2. 작성자 코멘트
      if (meal.comment && meal.comment.toLowerCase().includes(q)) {
        matchedFields.push('comment');
      }

      // 3. AI 평가 총평 (코멘트)
      if (meal.aiReview && meal.aiReview.toLowerCase().includes(q)) {
        matchedFields.push('aiReview');
      }

      // 4. 작성자 이름
      if (meal.member && meal.member.toLowerCase().includes(q)) {
        matchedFields.push('member');
      }

      // 5. 게시글 댓글 (댓글 내용 및 작성자)
      if (meal.comments && Array.isArray(meal.comments)) {
        for (const c of meal.comments) {
          if (!c.isDeleted && c.content && c.content.toLowerCase().includes(q)) {
            matchedReplies.push({
              author: c.author || '익명',
              content: c.content,
            });
          }
        }
        if (matchedReplies.length > 0) {
          matchedFields.push('comments');
        }
      }

      if (matchedFields.length > 0) {
        matches.push({
          meal,
          matchedFields,
          matchedReplies,
        });
      }
    }

    // 정렬: 최신순 또는 점수순
    matches.sort((a, b) => {
      if (sortBy === 'score') {
        const scoreDiff = (b.meal.score || 0) - (a.meal.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getMealTime(b.meal) - getMealTime(a.meal);
      }
      // 최신순 (날짜 내림차순 -> 시간 내림차순)
      return getMealTime(b.meal) - getMealTime(a.meal);
    });

    return matches;
  }, [meals, query, sortBy]);

  if (!isOpen) return null;

  const handleApplyToMainScreen = () => {
    if (onApplyToMain && query.trim()) {
      onApplyToMain(query.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* 헤더 */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/40 border-b border-cyan-500/20 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>식사 배틀 통합 검색</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  전체 대상
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                제목(메뉴명), 출품 코멘트, 댓글 내용, AI 심사평 어디든 일치하는 게시물을 모두 찾아냅니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 검색 입력창 영역 */}
        <div className="p-3.5 sm:p-5 bg-slate-950/60 border-b border-slate-800 shrink-0 space-y-3">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-cyan-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색어를 입력하세요 (예: 탕수육, 치킨, 소고기)"
              className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl pl-11 pr-10 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-slate-500 outline-none transition-all shadow-inner"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="지우기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 추천 키워드 칩 */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1 shrink-0 text-[11px]">
              <Tag className="w-3 h-3 text-cyan-400" />
              추천 검색어:
            </span>
            {popularKeywords.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => setQuery(kw)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  query === kw
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                #{kw}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 결과 컨트롤 바 (건수 + 정렬 + 메인화면 적용) */}
        {query.trim() && (
          <div className="px-4 sm:px-6 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-slate-300 font-medium">
                &quot;<strong className="text-cyan-300">{query.trim()}</strong>&quot; 검색 결과:
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                총 {searchResults.length}건
              </span>
            </div>

            <div className="flex items-center space-x-2 ml-auto">
              {/* 정렬 버튼 */}
              <div className="inline-flex rounded-lg bg-slate-800/90 p-0.5 border border-slate-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSortBy('latest')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    sortBy === 'latest'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  최신순
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('score')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    sortBy === 'score'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  점수순
                </button>
              </div>

              {/* 메인 화면에 필터 적용 버튼 */}
              {searchResults.length > 0 && onApplyToMain && (
                <button
                  type="button"
                  onClick={handleApplyToMainScreen}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                  title="메인 화면 게시판에 이 검색 결과를 적용하여 모아봅니다"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>메인 화면에서 보기</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 본문 결과 목록 영역 */}
        <div className="p-3 sm:p-5 flex-1 overflow-y-auto space-y-3">
          {/* 1. 검색어 미입력 시 가이드 안내 */}
          {!query.trim() && (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-cyan-400 shadow-inner">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                검색어를 입력하시면 전체 출품작을 검색합니다
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                출품작 제목(메뉴명), 멤버 코멘트, 회원들의 댓글, AI 미식 심사위원 총평까지 모두 실시간으로 탐색하여 찾아드립니다.
              </p>
            </div>
          )}

          {/* 2. 검색 결과 없음 */}
          {query.trim() && searchResults.length === 0 && (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-300">
                &quot;<span className="text-cyan-400">{query}</span>&quot;에 대한 검색 결과가 없습니다
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                다른 단어로 검색하시거나 추천 키워드(탕수육, 치킨, 소고기 등)를 선택해 보세요.
              </p>
            </div>
          )}

          {/* 3. 검색 결과 목록 */}
          {query.trim() && searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map(({ meal, matchedFields, matchedReplies }) => {
                const memberInfo = getMemberInfo(meal.member);
                const q = query.trim();

                return (
                  <div
                    key={meal.id}
                    onClick={() => onMealClick && onMealClick(meal)}
                    className="p-3 sm:p-4 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer shadow-md hover:shadow-cyan-500/10 flex flex-col sm:flex-row gap-3.5 group"
                  >
                    {/* 이미지 썸네일 */}
                    <div className="relative w-full sm:w-36 h-36 sm:h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                      {meal.imageUrl ? (
                        <img
                          src={meal.imageUrl}
                          alt={meal.menuName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                          이미지 없음
                        </div>
                      )}

                      {/* WINNER 배지 */}
                      {meal.isWinner && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[10px] font-black flex items-center gap-1 shadow-sm">
                          <Crown className="w-3 h-3 text-slate-950 fill-current" />
                          <span>WIN</span>
                        </div>
                      )}

                      {/* 점수 배지 */}
                      {typeof meal.score === 'number' && (
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-slate-900/90 text-amber-300 border border-amber-500/40 text-[11px] font-black">
                          {meal.score}점
                        </div>
                      )}
                    </div>

                    {/* 카드 정보 본문 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* 1행: 날짜/슬롯, 멤버, 일치 항목 배지들 */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {meal.date} ({meal.slot})
                          </span>

                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: memberInfo?.avatarBg || '#334155',
                              color: memberInfo?.textColor || '#ffffff',
                            }}
                          >
                            {highlightMatch(meal.member, q)}
                          </span>
                        </div>

                        {/* 일치 항목 배지 태그들 */}
                        <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold">
                          {matchedFields.includes('menuName') && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                              메뉴명 일치
                            </span>
                          )}
                          {matchedFields.includes('comment') && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              코멘트 일치
                            </span>
                          )}
                          {matchedFields.includes('aiReview') && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              AI평가 일치
                            </span>
                          )}
                          {matchedFields.includes('comments') && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              댓글 일치
                            </span>
                          )}
                          {matchedFields.includes('member') && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              작성자 일치
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 메뉴 제목 */}
                      <h4 className="text-sm sm:text-base font-extrabold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        {highlightMatch(meal.menuName || '(등록된 메뉴명 없음)', q)}
                      </h4>

                      {/* 작성자 코멘트 (있을 경우) */}
                      {meal.comment && (
                        <p className="text-xs text-slate-300 line-clamp-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-400 font-bold mr-1">코멘트:</span>
                          {highlightMatch(meal.comment, q)}
                        </p>
                      )}

                      {/* AI 심사위원 평가 코멘트 (있을 경우) */}
                      {meal.aiReview && (
                        <p className="text-xs text-slate-300 line-clamp-2 bg-slate-900/40 p-2 rounded-lg border border-slate-800/60">
                          <span className="text-amber-400 font-bold mr-1">AI 심사:</span>
                          {highlightMatch(meal.aiReview, q)}
                        </p>
                      )}

                      {/* 일치하는 댓글 내용 스니펫 (있을 경우) */}
                      {matchedReplies.length > 0 && (
                        <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30 space-y-1 text-xs">
                          <div className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>일치하는 댓글 ({matchedReplies.length}개):</span>
                          </div>
                          {matchedReplies.slice(0, 2).map((reply, rIdx) => (
                            <p key={rIdx} className="text-slate-300 pl-2 border-l-2 border-cyan-500/50 line-clamp-1">
                              <strong className="text-white mr-1">{reply.author}:</strong>
                              {highlightMatch(reply.content, q)}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* 하단 댓글 개수 및 상세 링크 */}
                      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-slate-500" />
                          댓글 {meal.comments?.length || 0}개
                        </span>
                        <span className="text-cyan-400 group-hover:text-cyan-300 font-bold flex items-center gap-0.5">
                          상세보기 & 댓글 작성 &gt;
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>
            {query.trim()
              ? `총 ${searchResults.length}개의 출품작 발견`
              : '제목, 코멘트, 댓글, AI평가 통합 검색'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
