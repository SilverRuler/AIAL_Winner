'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Users, X, Check, ChevronDown, Sparkles } from 'lucide-react';
import { MEMBERS, getMemberInfo } from '@/constants/members';
import { MealEntry } from '@/types/meal';

interface MemberFilterPopoverProps {
  selectedMember: string | null;
  onSelectMember: (member: string | null) => void;
  meals: MealEntry[];
}

export const MemberFilterPopover: React.FC<MemberFilterPopoverProps> = ({
  selectedMember,
  onSelectMember,
  meals,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 멤버별 총 등록 건수 집계
  const memberCountMap = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of MEMBERS) {
      counts[m.name] = 0;
    }
    for (const meal of meals) {
      if (counts[meal.member] !== undefined) {
        counts[meal.member] += 1;
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

          let leftOffset = (rect.width - popoverWidth) / 2;
          const screenLeft = rect.left + leftOffset;

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

  const memberInfo = selectedMember ? getMemberInfo(selectedMember) : null;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* 트리거 버튼 */}
      {selectedMember ? (
        <div className="inline-flex items-center rounded-xl bg-amber-500/20 border border-amber-500/50 p-1 text-xs sm:text-sm font-bold text-amber-300 shadow-sm">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-1 px-2 py-0.5 hover:text-white transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-extrabold">{selectedMember}</span>
            <ChevronDown className={`w-3 h-3 text-amber-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onSelectMember(null)}
            className="p-1 rounded-lg text-amber-400 hover:text-white hover:bg-amber-500/30 transition-colors ml-0.5 cursor-pointer"
            title="필터 해제 (전체 보기)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-white transition-all text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
        >
          <Users className="w-4 h-4 text-amber-400" />
          <span>멤버별 조회</span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* 드롭다운 팝오버 */}
      {isOpen && (
        <div
          style={popoverStyle}
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-40 p-3 space-y-2 animate-fade-in"
        >
          {/* 팝오버 헤더 */}
          <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>멤버별 식사 조회</span>
            </div>
            {selectedMember && (
              <button
                type="button"
                onClick={() => {
                  onSelectMember(null);
                  setIsOpen(false);
                }}
                className="text-[11px] text-amber-400 hover:underline font-medium"
              >
                전체보기 (필터 해제)
              </button>
            )}
          </div>

          {/* 전체보기 버튼 */}
          <button
            type="button"
            onClick={() => {
              onSelectMember(null);
              setIsOpen(false);
            }}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
              !selectedMember
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>전체 멤버 식사 보기</span>
            </span>
            <span className="text-[11px] opacity-80">총 {meals.length}건</span>
          </button>

          {/* 12인 멤버 그리드 */}
          <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
            {MEMBERS.map((m) => {
              const isSelected = selectedMember === m.name;
              const count = memberCountMap[m.name] || 0;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelectMember(m.name);
                    setIsOpen(false);
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-extrabold scale-102'
                      : `${m.avatarBg} ${m.borderColor} hover:border-slate-500 hover:scale-101`
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${
                      isSelected ? 'bg-black/20 text-slate-950' : 'bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    {count}건
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
