'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Award, X, ChevronDown, Sparkles } from 'lucide-react';
import { MealEntry } from '@/types/meal';

export interface ScoreRange {
  id: string;
  label: string;
  min: number;
  max: number;
}

export const SCORE_RANGES: ScoreRange[] = [
  { id: '90-100', label: '90점 ~ 100점', min: 90, max: 100 },
  { id: '80-90', label: '80점 ~ 90점', min: 80, max: 90 },
  { id: '70-80', label: '70점 ~ 80점', min: 70, max: 80 },
  { id: '60-70', label: '60점 ~ 70점', min: 60, max: 70 },
  { id: '50-60', label: '50점 ~ 60점', min: 50, max: 60 },
  { id: '40-50', label: '40점 ~ 50점', min: 40, max: 50 },
  { id: '30-40', label: '30점 ~ 40점', min: 30, max: 40 },
  { id: '20-30', label: '20점 ~ 30점', min: 20, max: 30 },
  { id: '10-20', label: '10점 ~ 20점', min: 10, max: 20 },
  { id: '0-10', label: '0점 ~ 10점', min: 0, max: 10 },
];

interface ScoreFilterPopoverProps {
  selectedScore: ScoreRange | null;
  onSelectScore: (score: ScoreRange | null) => void;
  meals: MealEntry[];
}

export const ScoreFilterPopover: React.FC<ScoreFilterPopoverProps> = ({
  selectedScore,
  onSelectScore,
  meals,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 점수 범위별 총 등록 건수 집계
  const rangeCountMap = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of SCORE_RANGES) {
      counts[r.id] = 0;
    }
    for (const meal of meals) {
      if (typeof meal.score === 'number' && meal.score >= 0) {
        for (const r of SCORE_RANGES) {
          if (meal.score >= r.min && meal.score <= r.max) {
            counts[r.id] += 1;
          }
        }
      }
    }
    return counts;
  }, [meals]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 모바일 화면 밖으로 팝오버가 넘치지 않도록 자동 위치 및 너비 계산
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const updatePosition = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 640) {
          const rect = dropdownRef.current?.getBoundingClientRect();
          if (!rect) return;
          const popoverWidth = Math.min(300, window.innerWidth - 32);

          // 버튼 중앙을 기준으로 팝오버 배치
          let leftOffset = (rect.width - popoverWidth) / 2;
          const screenLeft = rect.left + leftOffset;

          // 화면 좌우 16px 패딩 안에 머물도록 보정
          if (screenLeft < 16) {
            leftOffset += 16 - screenLeft;
          } else if (screenLeft + popoverWidth > window.innerWidth - 16) {
            leftOffset -= screenLeft + popoverWidth - (window.innerWidth - 16);
          }

          setPopoverStyle({
            left: `${leftOffset}px`,
            right: 'auto',
            width: `${popoverWidth}px`,
          });
        } else {
          setPopoverStyle({});
        }
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* 트리거 버튼 */}
      {selectedScore ? (
        <div className="inline-flex items-center rounded-xl bg-amber-500/20 border border-amber-500/50 p-1 text-xs sm:text-sm font-bold text-amber-300 shadow-sm shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-1 px-2 py-0.5 hover:text-white transition-colors cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-extrabold">{selectedScore.label}</span>
            <ChevronDown
              className={`w-3 h-3 text-amber-400 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => onSelectScore(null)}
            className="p-1 rounded-lg text-amber-400 hover:text-white hover:bg-amber-500/30 transition-colors ml-0.5 cursor-pointer"
            title="점수 필터 해제 (전체 보기)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-white transition-all text-xs sm:text-sm font-bold shadow-sm cursor-pointer shrink-0"
        >
          <Award className="w-4 h-4 text-amber-400" />
          <span>점수별 조회</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {/* 드롭다운 팝오버 */}
      {isOpen && (
        <div
          style={popoverStyle}
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-40 p-3 space-y-2.5 animate-fade-in"
        >
          {/* 팝오버 헤더 */}
          <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>점수대별 식사 조회</span>
            </div>
            {selectedScore && (
              <button
                type="button"
                onClick={() => {
                  onSelectScore(null);
                  setIsOpen(false);
                }}
                className="text-[11px] text-amber-400 hover:underline cursor-pointer"
              >
                전체보기 (필터 해제)
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 px-1">
            100점부터 0점까지 10점 단위로 맛 점수대별 식사를 모아봅니다.
          </p>

          {/* 10개 점수 구간 버튼 그리드 */}
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-0.5 no-scrollbar">
            {SCORE_RANGES.map((range) => {
              const isSelected = selectedScore?.id === range.id;
              const count = rangeCountMap[range.id] || 0;

              return (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onSelectScore(null);
                    } else {
                      onSelectScore(range);
                    }
                    setIsOpen(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md scale-[1.02]'
                      : count > 0
                      ? 'bg-slate-950/80 border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/80 text-white'
                      : 'bg-slate-950/40 border-slate-800/50 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold tracking-tight">{range.label}</span>
                    {range.min >= 90 && (
                      <Sparkles
                        className={`w-3 h-3 ${
                          isSelected ? 'text-slate-950' : 'text-amber-400'
                        }`}
                      />
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-1 font-mono ${
                      isSelected
                        ? 'text-slate-900 font-bold'
                        : count > 0
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-600'
                    }`}
                  >
                    {count > 0 ? `${count}건 등록` : '0건'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
