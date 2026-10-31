'use client';

import React from 'react';
import { MealEntry } from '@/types/meal';
import { getMemberInfo, getWinnerHeaderText } from '@/constants/members';
import { Crown, Sparkles, MoreVertical, Edit2, Trash2, Award, MessageSquare } from 'lucide-react';

interface MealCardProps {
  meal: MealEntry;
  onImageClick: (url: string, title: string) => void;
  onDetailClick: (meal: MealEntry) => void;
  onEdit: (meal: MealEntry) => void;
  onDelete: (meal: MealEntry) => void;
}

export const MealCard: React.FC<MealCardProps> = ({
  meal,
  onImageClick,
  onDetailClick,
  onEdit,
  onDelete,
}) => {
  const memberInfo = getMemberInfo(meal.member);
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className={`relative group rounded-2xl transition-all duration-300 flex flex-col ${
        showMenu ? 'z-30' : 'z-0'
      } ${
        meal.isWinner
          ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/20 border-2 border-amber-400/80 shadow-xl shadow-amber-500/10 ring-2 ring-amber-400/20'
          : 'bg-slate-900/90 border border-slate-800 hover:border-slate-700 shadow-md hover:shadow-slate-900/50'
      }`}
    >
      {/* 카드 상단 배너: 우승작 배너 또는 일반 평가 점수 배너 (모든 게시물 점수 노출) */}
      {meal.isWinner ? (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-3 py-1.5 flex items-center justify-between text-slate-950 font-black text-xs shadow-sm rounded-t-2xl">
          <div className="flex items-center space-x-1.5">
            <Crown className="w-4 h-4 text-slate-950 fill-slate-950 animate-bounce" />
            <span className="tracking-wide">{getWinnerHeaderText(meal.date, meal.slot)}</span>
          </div>
          {meal.score !== undefined && (
            <div className="inline-flex items-center space-x-1 bg-black/20 px-2.5 py-0.5 rounded-full text-slate-950 text-[11px] font-bold">
              <Award className="w-3.5 h-3.5" />
              <span>맛 점수 {meal.score}점</span>
            </div>
          )}
        </div>
      ) : meal.score !== undefined ? (
        <div className="bg-slate-800/90 border-b border-slate-700/80 px-3 py-1.5 flex items-center justify-between text-xs rounded-t-2xl">
          <div className="flex items-center space-x-1 text-slate-400 font-bold text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>AI 미식 심사완료</span>
          </div>
          <div className="inline-flex items-center space-x-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono shadow-sm">
            <Award className="w-3 h-3 text-amber-400" />
            <span>맛 점수 {meal.score}점</span>
          </div>
        </div>
      ) : null}

      {/* 이미지 영역 */}
      <div
        onClick={() => onImageClick(meal.imageUrl, `${meal.member}님의 ${meal.menuName}`)}
        className={`relative aspect-[4/3] w-full overflow-hidden bg-slate-950 cursor-pointer group/img ${
          meal.isWinner || meal.score !== undefined ? '' : 'rounded-t-2xl'
        }`}
      >
        <img
          src={meal.imageUrl}
          alt={meal.menuName}
          className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 opacity-60 group-hover/img:opacity-40 transition-opacity" />

        {/* 멤버 뱃지 (이미지 좌상단) */}
        <div className="absolute top-3 left-3 z-10">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold border backdrop-blur-md shadow-md ${memberInfo.avatarBg} ${memberInfo.borderColor}`}
          >
            {meal.member}
          </span>
        </div>

        {/* 등록 날짜, 타임 및 시각 (이미지 우상단) */}
        <div className="absolute top-3 right-3 z-10 flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] sm:text-[11px] text-slate-300 font-mono">
          <span className="hidden xs:inline sm:inline">{meal.date.substring(5)}</span>
          <span className="text-amber-400 font-bold">{meal.slot}</span>
          <span>{meal.time}</span>
        </div>

        {/* 클릭 시 확대 안내 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/30">
          <span className="text-xs bg-slate-900/90 text-white font-medium px-3 py-1.5 rounded-full border border-slate-700 shadow-lg">
            🔍 사진 크게보기
          </span>
        </div>
      </div>

      {/* 본문 정보 영역 (클릭 시 상세 모달 오픈 & 댓글 작성) */}
      <div
        onClick={() => onDetailClick(meal)}
        className="p-4 flex-1 flex flex-col justify-between space-y-3 min-h-[80px] cursor-pointer hover:bg-slate-800/25 transition-colors rounded-b-2xl group/body"
      >
        <div>
          {/* 메뉴명 및 관리자 액션 메뉴 */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2 group-hover/body:text-amber-200 transition-colors">
              {meal.menuName}
            </h3>

            {/* 더보기 / 관리자 메뉴 */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="관리자 메뉴 (수정/삭제)"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-8 w-32 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-40 py-1 text-xs divide-y divide-slate-800 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(meal);
                      }}
                      className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>수정하기</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(meal);
                      }}
                      className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 flex items-center space-x-2 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span className="font-semibold">삭제하기</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 멤버 한 줄 코멘트 */}
          {meal.comment && (
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 bg-slate-800/40 px-3 py-2 rounded-xl border border-slate-800/80 italic">
              &quot;{meal.comment}&quot;
            </p>
          )}
        </div>

        {/* AI 심사평 및 맛 점수 영역 (평가된 경우) */}
        {meal.aiReview && (
          <div
            className={`p-3 rounded-xl text-xs space-y-1.5 ${
              meal.isWinner
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                : 'bg-slate-800/60 border border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-[11px] opacity-90">
              <div className="flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{meal.isWinner ? '👑 AI 미식 심사위원 총평' : '🤖 AI 미식 피드백'}</span>
              </div>
              {meal.score !== undefined && (
                <span className="font-mono text-amber-400 font-extrabold text-[11px]">
                  맛 점수 {meal.score}점
                </span>
              )}
            </div>
            <p className="leading-relaxed font-medium line-clamp-3">{meal.aiReview}</p>
          </div>
        )}

        {/* 하단 댓글 개수 및 상세 모달 열기 안내 */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="inline-flex items-center space-x-1.5 text-slate-400 group-hover/body:text-amber-300 transition-colors">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="font-semibold text-[11px]">
              댓글 {meal.comments && meal.comments.length > 0 ? meal.comments.length : 0}개
            </span>
          </div>
          <span className="text-[11px] text-slate-500 group-hover/body:text-amber-400/90 transition-colors font-medium">
            상세보기 & 댓글 💬
          </span>
        </div>
      </div>
    </div>
  );
};
