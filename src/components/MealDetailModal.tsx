'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Trash2,
  Crown,
  Sparkles,
  Calendar,
  Clock,
  Award,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { MealEntry, MealComment, Member } from '@/types/meal';
import { MEMBERS, getMemberInfo } from '@/constants/members';
import { maskIp } from '@/lib/ip';

interface MealDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  meal: MealEntry | null;
  isAdmin?: boolean;
  onImageClick: (url: string, title: string) => void;
  onCommentAdded: (mealId: string, newComment: MealComment) => void;
  onCommentDeleted: (mealId: string, commentId: string) => void;
}

export const MealDetailModal: React.FC<MealDetailModalProps> = ({
  isOpen,
  onClose,
  meal,
  isAdmin = false,
  onImageClick,
  onCommentAdded,
  onCommentDeleted,
}) => {
  const [author, setAuthor] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // ESC 키 닫기 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setErrorMsg('');
      // 직전에 작성한 닉네임이 로컬스토리지에 있으면 자동 복원
      if (typeof window !== 'undefined') {
        const savedAuthor = localStorage.getItem('aial_last_comment_author');
        if (savedAuthor) {
          const found = MEMBERS.find((m) => m.name === savedAuthor);
          if (found) {
            setSelectedMember(found);
            setAuthor(found.name);
          } else {
            setSelectedMember(null);
            setAuthor(savedAuthor);
          }
        }
      }
    }
  }, [isOpen]);

  const handleSelectMember = (m: Member) => {
    if (selectedMember?.id === m.id) {
      setSelectedMember(null);
      setAuthor('');
    } else {
      setSelectedMember(m);
      setAuthor(m.name);
      setErrorMsg('');
    }
  };

  const handleClearSelectedMember = () => {
    setSelectedMember(null);
    setAuthor('');
  };

  if (!isOpen || !meal) return null;

  const memberInfo = getMemberInfo(meal.member);
  const comments = meal.comments || [];

  // 날짜 및 요일 포맷 (예: 2026.10.31. (토))
  const formatMealDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dayName = days[dateObj.getDay()] || '';
      const padM = String(m).padStart(2, '0');
      const padD = String(d).padStart(2, '0');
      return `${y}.${padM}.${padD}. (${dayName})`;
    } catch {
      return dateStr || '';
    }
  };
  const formattedMealDate = formatMealDate(meal.date);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedAuthor = author.trim();
    const trimmedContent = content.trim();

    if (!trimmedAuthor) {
      setErrorMsg('작성자 닉네임을 입력하거나 아래 멤버 중 1명을 선택해주세요.');
      return;
    }

    if (!trimmedContent) {
      setErrorMsg('댓글 내용을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const resp = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: meal.id,
          author: trimmedAuthor,
          content: trimmedContent,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || '댓글 등록에 실패했습니다.');
      }

      // 로컬스토리지에 닉네임 기억
      if (typeof window !== 'undefined') {
        localStorage.setItem('aial_last_comment_author', trimmedAuthor);
      }

      setContent('');
      onCommentAdded(meal.id, data.comment);
    } catch (err: any) {
      setErrorMsg(err.message || '댓글 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!meal) return;
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;

    try {
      setDeletingCommentId(commentId);

      const isUserAdmin =
        isAdmin ||
        (typeof window !== 'undefined' && sessionStorage.getItem('aial_is_admin') === 'true');

      let url = `/api/comments?mealId=${encodeURIComponent(meal.id)}&commentId=${encodeURIComponent(
        commentId
      )}`;

      // 관리자 로그인 상태면 관리자 자격 증명 동봉
      if (isUserAdmin) {
        url += `&adminId=aaa&adminPw=bbb`;
      }

      let resp = await fetch(url, { method: 'DELETE' });
      let data = await resp.json();

      // 본인 작성 기기(IP)가 아닌 경우 관리자 패스워드 입력 안내
      if (!resp.ok && resp.status === 403 && data.requireAdmin && !isUserAdmin) {
        const inputPw = prompt(
          `${data.message}\n\n관리자이신 경우 비밀번호를 입력하시면 즉시 삭제할 수 있습니다:`
        );
        if (inputPw && inputPw.trim()) {
          const adminUrl = `/api/comments?mealId=${encodeURIComponent(
            meal.id
          )}&commentId=${encodeURIComponent(
            commentId
          )}&adminId=aaa&adminPw=${encodeURIComponent(inputPw.trim())}`;
          resp = await fetch(adminUrl, { method: 'DELETE' });
          data = await resp.json();
        } else {
          return; // 취소 시 종료
        }
      }

      if (!resp.ok || !data.success) {
        throw new Error(data.message || '댓글 삭제 실패');
      }

      onCommentDeleted(meal.id, commentId);
    } catch (err: any) {
      alert(err.message || '댓글 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  // 시간 포맷 헬퍼
  const formatCommentTime = (ts: number) => {
    if (!ts) return '';
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000); // 초 단위
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-950 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl ${memberInfo.avatarBg} ${memberInfo.textColor} border ${memberInfo.borderColor} flex items-center justify-center font-bold text-xs shrink-0 shadow-sm`}
            >
              {memberInfo.name.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-white text-sm sm:text-base truncate">
                  {meal.member}님의 식사
                </span>
                {meal.isWinner && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                    <Crown className="w-3 h-3 text-amber-400" />
                    WINNER
                  </span>
                )}
                {meal.score !== undefined && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-mono font-bold">
                    <Award className="w-3 h-3 text-amber-400" />
                    {meal.score}점
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {formattedMealDate} · {meal.slot}
                </span>
                {meal.time && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {meal.time}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 (스크롤) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* 1. 메뉴명 및 소개 코멘트 */}
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
              <span>🍽️</span>
              <span>{meal.menuName}</span>
            </h3>
            {meal.comment && (
              <p className="text-xs sm:text-sm text-slate-300 italic pl-6 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                &quot;{meal.comment}&quot;
              </p>
            )}
          </div>

          {/* 2. 사진 미리보기 카드 (클릭 시 전체화면 확대) */}
          <div
            onClick={() => onImageClick(meal.imageUrl, `${meal.member}님의 ${meal.menuName}`)}
            className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 cursor-pointer group shadow-lg"
            title="클릭하여 원본 사진 확대보기"
          >
            <img
              src={meal.imageUrl}
              alt={meal.menuName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 text-white text-xs font-bold backdrop-blur-md border border-white/20 shadow-xl">
                <ExternalLink className="w-3.5 h-3.5" />
                사진 원본 크게보기
              </span>
            </div>
          </div>

          {/* 3. AI 미식 심사평 (평가된 경우) */}
          {meal.aiReview && (
            <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs text-slate-200 space-y-1 shadow-inner">
              <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI 미식 심사위원 총평</span>
              </div>
              <p className="leading-relaxed pl-5 font-medium">{meal.aiReview}</p>
            </div>
          )}

          {/* 구분선 */}
          <div className="border-t border-slate-800/80 pt-2" />

          {/* 4. 댓글 섹션 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span>댓글</span>
                <span className="text-amber-400 font-bold text-xs font-mono">
                  ({comments.length})
                </span>
              </h4>
              <span className="text-[11px] text-slate-500">누구나 자유롭게 댓글을 남길 수 있습니다</span>
            </div>

            {/* 댓글 작성 폼 */}
            <form onSubmit={handlePostComment} className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-sm">
              {/* 닉네임 입력 및 12명 멤버 빠른 선택 칩 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-300">작성자 닉네임</label>
                  <span className="text-[10px] text-slate-400">
                    직접 입력(ㅇㅇ 등) 또는 아래 12명 멤버 칩 선택
                  </span>
                </div>

                {/* 12명 멤버 선택 시 고정값 뱃지 UI / 미선택 시 자유 입력창 */}
                {selectedMember ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 animate-fade-in">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-slate-400 font-medium">선택된 닉네임:</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black border shadow-sm ${selectedMember.avatarBg} ${selectedMember.borderColor}`}
                      >
                        {selectedMember.name}
                      </span>
                      <span className="text-[10px] text-amber-400/90 font-medium">(공식 닉 고정)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSelectedMember}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      직접 입력으로 변경 ✕
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => {
                        setAuthor(e.target.value);
                        setSelectedMember(null);
                      }}
                      placeholder="닉네임 직접 입력 (예: ㅇㅇ, 익명, 응원봇 등)"
                      maxLength={20}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    {author.trim() && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
                        유동닉: {author.trim()}
                      </span>
                    )}
                  </div>
                )}

                {/* 12인 멤버 퀵 셀렉트 칩 */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>12인 멤버 고유 닉네임 선택 (고유 필체·색상 고정):</span>
                    {selectedMember && (
                      <button
                        type="button"
                        onClick={handleClearSelectedMember}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        선택 해제
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                    {MEMBERS.map((m) => {
                      const isSelected = selectedMember?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectMember(m)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-black border transition-all shrink-0 cursor-pointer ${
                            isSelected
                              ? `${m.avatarBg} ${m.borderColor} ring-2 ring-amber-400 shadow-md scale-105`
                              : `${m.avatarBg} ${m.borderColor} opacity-80 hover:opacity-100 hover:scale-102`
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 댓글 본문 및 등록 버튼 */}
              <div className="space-y-1.5">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="맛있어 보이네요! 따뜻한 한마디나 평가를 남겨보세요..."
                  rows={2}
                  maxLength={300}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                />

                {errorMsg && (
                  <p className="text-[11px] text-rose-400 font-semibold">{errorMsg}</p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    {content.length}/300자
                  </span>
                  <button
                    type="submit"
                    disabled={isSubmitting || !content.trim() || !author.trim()}
                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-black hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>등록 중...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>댓글 등록</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* 댓글 목록 */}
            <div className="space-y-2 pt-1">
              {comments.length === 0 ? (
                <div className="py-8 text-center text-slate-500 space-y-1">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-medium">아직 등록된 댓글이 없습니다.</p>
                  <p className="text-[11px] text-slate-600">첫 번째로 댓글을 남겨보세요!</p>
                </div>
              ) : (
                comments.map((cmt) => {
                  const cmtMember = MEMBERS.find((m) => m.name === cmt.author);
                  const isDeleting = deletingCommentId === cmt.id;
                  const displayIp = !cmtMember ? maskIp(cmt.maskedIp || cmt.ip) : '';

                  return (
                    <div
                      key={cmt.id}
                      className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start justify-between gap-2.5 group hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          {cmtMember ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-sm ${cmtMember.avatarBg} ${cmtMember.borderColor}`}
                            >
                              {cmt.author}
                            </span>
                          ) : (
                            <>
                              <span className="font-extrabold text-white text-xs">
                                {cmt.author}
                              </span>
                              {displayIp && (
                                <span className="text-[11px] text-slate-400 font-mono font-normal">
                                  ({displayIp})
                                </span>
                              )}
                            </>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono pl-0.5">
                            {formatCommentTime(cmt.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                          {cmt.content}
                        </p>
                      </div>

                      {/* 댓글 삭제 버튼 */}
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteComment(cmt.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer shrink-0"
                        title="댓글 삭제"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
