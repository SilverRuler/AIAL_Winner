'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  Calendar,
  Clock,
  Utensils,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  CheckCircle2,
  Moon,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MealSlot, MealEntry } from '@/types/meal';
import {
  MEMBERS,
  MEAL_SLOTS,
  getCurrentMealSlot,
  getKSTNow,
  checkCanRegisterMeal,
} from '@/constants/members';
import { compressImageToDataUrl } from '@/lib/storage';

interface NewMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newMeal: MealEntry) => void;
  defaultDate?: string;
  defaultSlot?: MealSlot;
  submittedMembers?: string[];
  allMeals?: MealEntry[];
}

export const NewMealModal: React.FC<NewMealModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultDate,
  defaultSlot,
  submittedMembers = [],
  allMeals = [],
}) => {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [slot, setSlot] = useState<MealSlot>('점심');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [menuName, setMenuName] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실시간 현재 슬롯에 등록 완료된 멤버 목록 계산 (슬롯 전환 시 즉각 반영)
  const activeSubmittedMembers = useMemo(() => {
    if (allMeals && allMeals.length > 0) {
      return allMeals
        .filter((m) => m.date === date && m.slot === slot)
        .map((m) => m.member);
    }
    return submittedMembers;
  }, [allMeals, submittedMembers, date, slot]);

  // 모달 열릴 때 초기값 설정 (한국 표준시 KST 기준)
  useEffect(() => {
    if (isOpen) {
      const kst = getKSTNow();
      setDate(kst.date);
      setTime(kst.time);

      // defaultSlot이 등록 가능한 상태면 그것을 쓰고, 아니면 현재 활성 슬롯 또는 기본 슬롯(현재 시간에 맞는 슬롯)
      let initialSlot: MealSlot = defaultSlot || kst.activeSlot || getCurrentMealSlot();
      if (defaultSlot && checkCanRegisterMeal(kst.date, defaultSlot).canRegister) {
        initialSlot = defaultSlot;
      } else if (kst.activeSlot) {
        initialSlot = kst.activeSlot;
      }
      setSlot(initialSlot);

      setSelectedMember('');
      setMenuName('');
      setComment('');
      setImagePreview(null);

      const check = checkCanRegisterMeal(kst.date, initialSlot);
      if (!check.canRegister) {
        setErrorMsg(check.reason || '');
      } else {
        setErrorMsg('');
      }
    }
  }, [isOpen, defaultDate, defaultSlot]);

  // 클립보드 붙여넣기(Ctrl+V) 지원
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            await handleProcessImage(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProcessImage = async (file: File) => {
    try {
      setErrorMsg('');
      setIsCompressing(true);
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrl) {
        setImagePreview(dataUrl);
      } else {
        setErrorMsg('이미지를 불러오지 못했습니다. 다른 사진으로 다시 시도해주세요.');
      }
    } catch (err: any) {
      console.error('Image compression error:', err);
      setErrorMsg('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessImage(file);
    }
    // 동일 파일 재선택 가능하도록 리셋
    e.target.value = '';
  };

  const handleSelectMember = (memberName: string) => {
    if (activeSubmittedMembers.includes(memberName)) {
      setErrorMsg(`${memberName}님은 이미 이번 ${slot}에 등록을 완료하셨습니다. (1인 1회 제한)`);
      return;
    }
    setErrorMsg('');
    setSelectedMember(memberName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // 한국 시간(KST) 기준 등록 가능 여부 검증 (지난 타임대 및 22:30~05:00 휴식시간 차단)
    const timeCheck = checkCanRegisterMeal(date, slot);
    if (!timeCheck.canRegister) {
      setErrorMsg(timeCheck.reason || '현재 시간대에는 등록할 수 없습니다.');
      return;
    }

    // 필수 항목 검증
    if (!selectedMember) {
      setErrorMsg('올리는 멤버(12명 중 본인)를 선택해주세요.');
      return;
    }

    if (activeSubmittedMembers.includes(selectedMember)) {
      setErrorMsg(`${selectedMember}님은 이미 이번 ${slot}에 식사 사진을 등록하셨습니다. (각 타임당 1인 1회 제한)`);
      return;
    }

    if (!imagePreview) {
      setErrorMsg('식사 사진을 업로드해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        date,
        time,
        slot,
        member: selectedMember,
        menuName: menuName.trim() || '오늘의 한 끼',
        comment: comment.trim(),
        imageUrl: imagePreview,
      };

      const resp = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.message || '식사 등록 실패');
      }

      // 우승 축하 폭죽 효과
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });

      onSuccess(data.meal);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 모달 헤더 */}
        <div className="px-5 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                오늘의 식사 사진 등록
              </h2>
              <p className="text-[11px] text-slate-400">
                멤버를 선택하고 맛있는 식사 사진을 올려보세요! (타임대별 1인 1회)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 영역 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {(() => {
            const kst = getKSTNow();
            if (!kst.isIdleTime) return null;
            return (
              <div className="p-3.5 rounded-xl bg-purple-950/50 border border-purple-500/40 text-purple-200 text-xs flex items-center space-x-2.5">
                <Moon className="w-5 h-5 shrink-0 text-purple-400" />
                <div>
                  <span className="font-bold block text-white">{kst.idleReason || '식사 배틀 휴식 시간'}</span>
                  <span className="text-[11px] text-purple-300">
                    현재는 식사 배틀 휴식 시간대로 글을 등록할 수 없습니다. (아침 05:00~10:00 / 점심 11:00~13:30 / 저녁 17:00~22:00)
                  </span>
                </div>
              </div>
            );
          })()}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. 멤버 단일 선택 (12명) - 필수 & 중복 등록 체크 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                <span>올리는 멤버 (1인 1회 등록 가능)</span>
                <span className="text-rose-400">*</span>
              </label>
              {selectedMember && (
                <span className="text-xs text-amber-400 font-bold">
                  선택됨: {selectedMember}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {MEMBERS.map((m) => {
                const isSelected = selectedMember === m.name;
                const isAlreadySubmitted = activeSubmittedMembers.includes(m.name);

                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isAlreadySubmitted}
                    onClick={() => handleSelectMember(m.name)}
                    className={`relative py-2 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center cursor-pointer ${
                      isAlreadySubmitted
                        ? 'opacity-40 bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed line-through'
                        : isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 scale-105'
                        : `${m.avatarBg} ${m.borderColor} hover:scale-102 hover:border-slate-500`
                    }`}
                    title={isAlreadySubmitted ? '이미 이번 타임에 등록 완료' : `${m.name} 선택`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 right-1">
                        <Check className="w-3 h-3 stroke-[3] text-slate-950" />
                      </div>
                    )}
                    {isAlreadySubmitted && (
                      <span className="text-[9px] text-slate-400 font-normal no-underline block">
                        완료
                      </span>
                    )}
                    <span className="truncate w-full text-center">{m.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 날짜, 시간 & 식사 타임대 선택 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 식사 타임대 */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                식사 타임 <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {MEAL_SLOTS.map((s) => {
                  const check = checkCanRegisterMeal(date, s.slot);
                  const isBlocked = !check.canRegister;
                  const isSelected = slot === s.slot;

                  return (
                    <button
                      key={s.slot}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => {
                        setSlot(s.slot);
                        setSelectedMember('');
                        setErrorMsg('');
                      }}
                      className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center ${
                        isBlocked
                          ? 'opacity-35 bg-slate-900/60 text-slate-600 cursor-not-allowed'
                          : isSelected
                          ? 'bg-amber-500 text-slate-950 shadow-sm cursor-pointer'
                          : 'text-slate-400 hover:text-white cursor-pointer'
                      }`}
                      title={isBlocked ? check.reason : `${s.slot} 타임 선택`}
                    >
                      <span>{s.slot}</span>
                      {isBlocked && (
                        <span className="text-[9px] text-rose-400 font-normal">
                          {s.slot === '아침' && getKSTNow().totalMins >= 600 ? '종료' :
                           s.slot === '점심' && getKSTNow().totalMins >= 810 ? '종료' :
                           s.slot === '저녁' && getKSTNow().totalMins >= 1320 ? '종료' : '대기'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 날짜 (한국 시간 KST 오늘만 등록 가능) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>날짜 <span className="text-rose-400">*</span></span>
                <span className="text-[10px] text-amber-400/90 font-normal">KST 오늘만 가능</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  readOnly
                  title="식사는 한국 시간 오늘 날짜에만 등록 가능합니다."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 cursor-not-allowed focus:outline-none"
                />
              </div>
            </div>

            {/* 시간 */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                시간
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* 3. 이미지 업로드 (필수) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              식사 사진 <span className="text-rose-400">*</span>
              <span className="ml-2 font-normal text-slate-400 text-[11px]">
                (파일 첨부, 모바일 사진 촬영 또는 <strong>Ctrl+V</strong> 붙여넣기)
              </span>
            </label>

            {imagePreview ? (
              <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-950 border border-amber-500/40 group">
                <img
                  src={imagePreview}
                  alt="미리보기"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                  <label className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-xs font-semibold hover:bg-slate-800 border border-slate-700 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                    사진 교체
                  </label>
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/90 text-white text-xs font-semibold hover:bg-rose-500 cursor-pointer"
                  >
                    사진 삭제
                  </button>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-950/50 hover:bg-slate-950 block relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                {isCompressing ? (
                  <div className="flex flex-col items-center space-y-2 py-4">
                    <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                    <span className="text-xs text-slate-300">이미지 최적화 압축 중...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs text-slate-300">
                      <span className="text-amber-400 font-bold">사진 선택 또는 촬영</span> (모바일 카메라 지원)
                    </div>
                    <p className="text-[11px] text-slate-500">
                      JPG, PNG, HEIC 등 모든 사진 지원 (자동 최적화)
                    </p>
                  </div>
                )}
              </label>
            )}
          </div>

          {/* 4. 메뉴 이름 및 코멘트 (선택 사항) */}
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300">
                  메뉴 이름 <span className="text-slate-500 font-normal">(선택)</span>
                </label>
                <span className="text-[11px] text-slate-500">미입력 시 &apos;오늘의 한 끼&apos;로 등록됩니다</span>
              </div>
              <input
                type="text"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="예: 숯불 제육볶음 & 차돌 된장찌개"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                한 줄 코멘트 <span className="text-slate-500 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="예: 겉바속촉 제대로라 오늘 무조건 1등 예상합니다!"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* 모달 하단 버튼 & 선택 닉네임 확인 */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="text-xs truncate">
              {selectedMember ? (
                <span className="text-slate-300 text-xs">
                  작성 닉: <strong className="text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">{selectedMember}</strong>
                </span>
              ) : (
                <span className="text-rose-400/90 text-[11px]">작성 닉을 선택해주세요</span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  isCompressing ||
                  !checkCanRegisterMeal(date, slot).canRegister
                }
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-500/25 hover:from-orange-600 hover:to-rose-600 transition-all flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>등록 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>식사 등록 완료</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
