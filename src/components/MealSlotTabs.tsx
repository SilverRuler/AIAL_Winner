'use client';

import React from 'react';
import { MealSlot } from '@/types/meal';
import { MEAL_SLOTS } from '@/constants/members';
import { Sunrise, Sun, Moon, Crown } from 'lucide-react';

interface MealSlotTabsProps {
  selectedSlot: MealSlot;
  onSelectSlot: (slot: MealSlot) => void;
  slotCounts: Record<MealSlot, number>;
  slotWinners: Record<MealSlot, string | undefined>;
}

export const MealSlotTabs: React.FC<MealSlotTabsProps> = ({
  selectedSlot,
  onSelectSlot,
  slotCounts,
  slotWinners,
}) => {
  const getIcon = (slot: MealSlot) => {
    switch (slot) {
      case '아침':
        return <Sunrise className="w-4 h-4 sm:w-5 sm:h-5" />;
      case '점심':
        return <Sun className="w-4 h-4 sm:w-5 sm:h-5" />;
      case '저녁':
        return <Moon className="w-4 h-4 sm:w-5 sm:h-5" />;
    }
  };

  return (
    <div className="flex items-center space-x-2 sm:space-x-3 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-inner backdrop-blur-sm">
      {MEAL_SLOTS.map(({ slot, timeRange, activeColor }) => {
        const isSelected = selectedSlot === slot;
        const count = slotCounts[slot] || 0;
        const winner = slotWinners[slot];

        return (
          <button
            key={slot}
            onClick={() => onSelectSlot(slot)}
            className={`flex-1 relative flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-2 rounded-xl transition-all cursor-pointer ${
              isSelected
                ? `${activeColor} shadow-lg ring-2 ring-white/20 font-bold scale-[1.01]`
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {/* 상단 타임 라벨 & 아이콘 */}
            <div className="flex items-center space-x-1.5">
              {getIcon(slot)}
              <span className="text-xs sm:text-base font-extrabold">{slot}</span>
              <span
                className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-mono ${
                  isSelected ? 'bg-black/25 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {count}
              </span>
            </div>

            {/* 시간대 안내 (모바일 & 데스크톱 모두 작은 글씨로 표시) */}
            <span
              className={`text-[9px] sm:text-[10px] mt-0.5 font-medium whitespace-nowrap tracking-tight ${
                isSelected ? 'text-white/90' : 'text-slate-500'
              }`}
            >
              {timeRange}
            </span>

            {/* 우승자 뱃지 (평가 완료 시, 공동 우승 지원) */}
            {winner && (
              <div
                title={`${winner} WIN`}
                className={`mt-1 inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold max-w-full ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                <Crown className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[85px] sm:max-w-[140px]">
                  {winner} {winner.includes(',') ? '공동WIN' : 'WIN'}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
