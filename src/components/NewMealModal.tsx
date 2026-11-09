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
  ShieldCheck,
  Lock,
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
import { validateMealImageExif } from '@/lib/exif';

interface NewMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newMeal: MealEntry) => void;
  defaultDate?: string;
  defaultSlot?: MealSlot;
  submittedMembers?: string[];
  allMeals?: MealEntry[];
  isAdmin?: boolean;
}

export const NewMealModal: React.FC<NewMealModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultDate,
  defaultSlot,
  submittedMembers = [],
  allMeals = [],
  isAdmin = false,
}) => {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [slot, setSlot] = useState<MealSlot>('점심');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [menuName, setMenuName] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exifInfo, setExifInfo] = useState<{
    photoDate: string;
    photoTime: string;
    sourceType?: 'camera' | 'kakaotalk' | 'live_camera';
    isAdminBypass?: boolean;
    bypassReason?: string;
  } | null>(null);
  const [exifRejectInfo, setExifRejectInfo] = useState<{
    photoDate?: string;
    photoTime?: string;
    reason: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 관리자 권한 상태 (prop, sessionStorage, localStorage 종합 실시간 판별)
  const [internalAdmin, setInternalAdmin] = useState<boolean>(false);
  const [showInlineAdminLogin, setShowInlineAdminLogin] = useState<boolean>(false);
  const [inlineAdminId, setInlineAdminId] = useState<string>('');
  const [inlineAdminPw, setInlineAdminPw] = useState<string>('');
  const [inlineAdminError, setInlineAdminError] = useState<string>('');
  const lastAttemptedFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setInternalAdmin(true);
      return;
    }
    if (typeof window !== 'undefined') {
      const isAuth =
        sessionStorage.getItem('aial_is_admin') === 'true' ||
        localStorage.getItem('aial_is_admin') === 'true' ||
        sessionStorage.getItem('aial_admin_id') === 'aaa' ||
        localStorage.getItem('aial_admin_id') === 'aaa';
      if (isAuth) {
        setInternalAdmin(true);
      }
    }
  }, [isAdmin, isOpen]);

  const isUserAdmin = Boolean(
    isAdmin ||
    internalAdmin ||
    (typeof window !== 'undefined' &&
      (sessionStorage.getItem('aial_is_admin') === 'true' ||
        localStorage.getItem('aial_is_admin') === 'true' ||
        sessionStorage.getItem('aial_admin_id') === 'aaa' ||
        localStorage.getItem('aial_admin_id') === 'aaa'))
  );

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

      const currentAdmin =
        isAdmin ||
        (typeof window !== 'undefined' &&
          (sessionStorage.getItem('aial_is_admin') === 'true' ||
            localStorage.getItem('aial_is_admin') === 'true' ||
            sessionStorage.getItem('aial_admin_id') === 'aaa' ||
            localStorage.getItem('aial_admin_id') === 'aaa'));

      // defaultSlot이 등록 가능한 상태면 그것을 쓰고, 아니면 현재 활성 슬롯 또는 기본 슬롯(현재 시간에 맞는 슬롯)
      let initialSlot: MealSlot = defaultSlot || kst.activeSlot || getCurrentMealSlot();
      if (defaultSlot && (currentAdmin || checkCanRegisterMeal(kst.date, defaultSlot).canRegister)) {
        initialSlot = defaultSlot;
      } else if (kst.activeSlot) {
        initialSlot = kst.activeSlot;
      }
      setSlot(initialSlot);

      setSelectedMember('');
      setMenuName('');
      setComment('');
      setImagePreview(null);
      setSelectedFile(null);
      setExifInfo(null);
      setExifRejectInfo(null);
      setShowInlineAdminLogin(false);
      setInlineAdminError('');

      if (!currentAdmin) {
        const check = checkCanRegisterMeal(kst.date, initialSlot);
        if (!check.canRegister) {
          setErrorMsg(check.reason || '');
        } else {
          setErrorMsg('');
        }
      } else {
        setErrorMsg('');
      }
    }
  }, [isOpen, defaultDate, defaultSlot, isAdmin]);

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
  }, [isOpen, isAdmin, internalAdmin, date, slot]);

  if (!isOpen) return null;

  const handleProcessImage = async (file: File, forceAdminBypass: boolean = false) => {
    try {
      lastAttemptedFileRef.current = file;
      setErrorMsg('');
      setIsCompressing(true);

      const checkAdmin =
        forceAdminBypass ||
        isUserAdmin ||
        (typeof window !== 'undefined' &&
          (sessionStorage.getItem('aial_is_admin') === 'true' ||
            localStorage.getItem('aial_is_admin') === 'true' ||
            sessionStorage.getItem('aial_admin_id') === 'aaa' ||
            localStorage.getItem('aial_admin_id') === 'aaa'));

      // EXIF 메타데이터 & 스크린샷 우회 차단 검증
      const exifCheck = await validateMealImageExif(file, date, slot);
      if (!exifCheck.isValid) {
        if (!checkAdmin) {
          setExifRejectInfo({
            photoDate: exifCheck.photoDate,
            photoTime: exifCheck.photoTime,
            reason: exifCheck.errorMessage || '해당 날짜 및 시간대의 사진이 아닙니다.',
          });
          setErrorMsg(exifCheck.errorMessage || '해당 날짜 및 시간대의 사진이 아닙니다.');
          setImagePreview(null);
          setSelectedFile(null);
          setExifInfo(null);
          return;
        }

        // 🛡️ 관리자 권한 활성화 상태: 메타데이터 검증 우회 허용!
        // (적정 시간대 외 사진, 카톡 사진, 스크린샷, 손상된 메타데이터 등 무제한 업로드 승인)
        setExifRejectInfo(null);
        setErrorMsg('');
        setExifInfo({
          photoDate: exifCheck.photoDate || date,
          photoTime: exifCheck.photoTime || time || getKSTNow().time,
          sourceType: exifCheck.sourceType || 'camera',
          isAdminBypass: true,
          bypassReason: exifCheck.errorMessage || '메타데이터 제한 우회',
        });
      } else {
        // 검증 통과 시 거부 로그 초기화 및 승인 정보 저장
        setExifRejectInfo(null);
        if (exifCheck.isValid && exifCheck.photoDate && exifCheck.photoTime) {
          setExifInfo({
            photoDate: exifCheck.photoDate,
            photoTime: exifCheck.photoTime,
            sourceType: exifCheck.sourceType,
            isAdminBypass: false,
          });
        } else {
          setExifInfo(null);
        }
      }

      setSelectedFile(file);

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

  const handleInlineAdminLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInlineAdminError('');

    if (inlineAdminId.trim() === 'aaa' && inlineAdminPw.trim() === 'bbb') {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aial_is_admin', 'true');
        sessionStorage.setItem('aial_admin_id', 'aaa');
        sessionStorage.setItem('aial_admin_pw', 'bbb');
        localStorage.setItem('aial_is_admin', 'true');
        localStorage.setItem('aial_admin_id', 'aaa');
        localStorage.setItem('aial_admin_pw', 'bbb');
      }
      setInternalAdmin(true);
      setShowInlineAdminLogin(false);
      setInlineAdminError('');

      // 거부되었던 파일이 있다면 즉시 관리자 우회로 재처리
      if (lastAttemptedFileRef.current) {
        handleProcessImage(lastAttemptedFileRef.current, true);
      }
    } else {
      setInlineAdminError('아이디 또는 비밀번호가 올바르지 않습니다.');
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

  const handleSlotChange = async (newSlot: MealSlot) => {
    setSlot(newSlot);
    setSelectedMember('');
    setErrorMsg('');

    const checkAdmin =
      isUserAdmin ||
      (typeof window !== 'undefined' &&
        (sessionStorage.getItem('aial_is_admin') === 'true' ||
          localStorage.getItem('aial_is_admin') === 'true' ||
          sessionStorage.getItem('aial_admin_id') === 'aaa' ||
          localStorage.getItem('aial_admin_id') === 'aaa'));

    // 이미 업로드된 파일이 있다면 새 슬롯 기준으로 EXIF 재검증
    if (selectedFile) {
      const reCheck = await validateMealImageExif(selectedFile, date, newSlot);
      if (!reCheck.isValid) {
        if (!checkAdmin) {
          setExifRejectInfo({
            photoDate: reCheck.photoDate,
            photoTime: reCheck.photoTime,
            reason: reCheck.errorMessage || '변경된 타임대에 맞지 않는 사진입니다.',
          });
          setErrorMsg(reCheck.errorMessage || '변경된 타임대에 맞지 않는 사진입니다.');
          setImagePreview(null);
          setSelectedFile(null);
          setExifInfo(null);
        } else {
          setExifRejectInfo(null);
          setExifInfo({
            photoDate: reCheck.photoDate || date,
            photoTime: reCheck.photoTime || time || getKSTNow().time,
            sourceType: reCheck.sourceType || 'camera',
            isAdminBypass: true,
            bypassReason: reCheck.errorMessage || '타임대 제한 우회',
          });
        }
      } else {
        setExifRejectInfo(null);
        if (reCheck.isValid && reCheck.photoDate && reCheck.photoTime) {
          setExifInfo({
            photoDate: reCheck.photoDate,
            photoTime: reCheck.photoTime,
            sourceType: reCheck.sourceType,
            isAdminBypass: false,
          });
        } else {
          setExifInfo(null);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const checkAdmin =
      isUserAdmin ||
      (typeof window !== 'undefined' &&
        (sessionStorage.getItem('aial_is_admin') === 'true' ||
          localStorage.getItem('aial_is_admin') === 'true' ||
          sessionStorage.getItem('aial_admin_id') === 'aaa' ||
          localStorage.getItem('aial_admin_id') === 'aaa'));

    // 한국 시간(KST) 기준 등록 가능 여부 검증 (지난 타임대 및 22:30~05:00 휴식시간 차단)
    // 관리자는 타임대 제한 없이 업로드 가능
    if (!checkAdmin) {
      const timeCheck = checkCanRegisterMeal(date, slot);
      if (!timeCheck.canRegister) {
        setErrorMsg(timeCheck.reason || '현재 시간대에는 등록할 수 없습니다.');
        return;
      }
    }

    // 1번 정책: 최종 EXIF 재검증 (선택된 파일의 촬영 일시와 슬롯 일치 여부)
    // 관리자는 메타데이터 제한(적정 시간대 외, 카톡, 스크린샷 등) 우회 가능
    if (!checkAdmin && selectedFile) {
      const finalExifCheck = await validateMealImageExif(selectedFile, date, slot);
      if (!finalExifCheck.isValid) {
        setErrorMsg(finalExifCheck.errorMessage || '사진의 촬영 일시가 선택된 날짜 및 시간대와 맞지 않습니다.');
        return;
      }
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

      let effAdminId = '';
      let effAdminPw = '';
      if (typeof window !== 'undefined') {
        effAdminId =
          sessionStorage.getItem('aial_admin_id') ||
          localStorage.getItem('aial_admin_id') ||
          '';
        effAdminPw =
          sessionStorage.getItem('aial_admin_pw') ||
          localStorage.getItem('aial_admin_pw') ||
          '';
      }
      if (checkAdmin && (!effAdminId || !effAdminPw)) {
        effAdminId = 'aaa';
        effAdminPw = 'bbb';
      }

      const finalExifTakenAt = exifInfo
        ? `${exifInfo.photoDate} ${exifInfo.photoTime}`
        : `${date} ${time || getKSTNow().time}`;

      const payload = {
        date,
        time,
        slot,
        member: selectedMember,
        menuName: menuName.trim() || '오늘의 한 끼',
        comment: comment.trim(),
        imageUrl: imagePreview,
        exifTakenAt: finalExifTakenAt,
        adminId: checkAdmin ? effAdminId : undefined,
        adminPw: checkAdmin ? effAdminPw : undefined,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (checkAdmin && effAdminId && effAdminPw) {
        headers['x-admin-id'] = effAdminId;
        headers['x-admin-pw'] = effAdminPw;
      }

      const resp = await fetch('/api/meals', {
        method: 'POST',
        headers,
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
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  오늘의 식사 사진 등록
                </h2>
                {isUserAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    관리자 권한 (메타데이터 제한 우회 허용)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInlineAdminLogin(!showInlineAdminLogin)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    <Lock className="w-3 h-3 text-amber-400" />
                    관리자 로그인
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {isUserAdmin
                  ? '관리자 모드: 적정 시간대 외 사진, 카톡 사진, 스크린샷도 자유롭게 등록할 수 있습니다.'
                  : '멤버를 선택하고 맛있는 식사 사진을 올려보세요! (타임대별 1인 1회)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 인라인 관리자 로그인 폼 */}
        {showInlineAdminLogin && !isUserAdmin && (
          <form
            onSubmit={handleInlineAdminLogin}
            className="px-5 py-3 bg-amber-950/40 border-b border-amber-500/30 flex flex-wrap items-center gap-2 text-xs"
          >
            <div className="flex items-center gap-1.5 text-amber-300 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>관리자 인증:</span>
            </div>
            <input
              type="text"
              placeholder="아이디"
              value={inlineAdminId}
              onChange={(e) => setInlineAdminId(e.target.value)}
              className="bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-amber-400 w-24 sm:w-28"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={inlineAdminPw}
              onChange={(e) => setInlineAdminPw(e.target.value)}
              className="bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-amber-400 w-28 sm:w-32"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer"
            >
              인증 및 즉시 승인
            </button>
            <button
              type="button"
              onClick={() => setShowInlineAdminLogin(false)}
              className="px-2 py-1 text-slate-400 hover:text-white transition-colors"
            >
              취소
            </button>
            {inlineAdminError && (
              <span className="text-rose-400 font-medium text-[11px] w-full">
                {inlineAdminError}
              </span>
            )}
          </form>
        )}

        {/* 폼 영역 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {(() => {
            const kst = getKSTNow();
            if (!kst.isIdleTime) return null;
            if (isUserAdmin) {
              return (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center space-x-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                  <div>
                    <span className="font-bold block text-white">관리자 권한 활성화</span>
                    <span className="text-[11px] text-amber-300">
                      휴식 시간대 및 적정 시간 외/카톡/스크린샷 사진도 등록할 수 있습니다.
                    </span>
                  </div>
                </div>
              );
            }
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
                  const isBlocked = !isUserAdmin && !check.canRegister;
                  const isSelected = slot === s.slot;

                  return (
                    <button
                      key={s.slot}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => handleSlotChange(s.slot)}
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
                      {isUserAdmin && !check.canRegister && (
                        <span className="text-[9px] text-amber-400/90 font-semibold">
                          관리자
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 날짜 (일반: 한국 시간 KST 오늘만 가능, 관리자: 날짜 변경 가능) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>날짜 <span className="text-rose-400">*</span></span>
                <span className={`text-[10px] font-normal ${isUserAdmin ? 'text-amber-400 font-bold' : 'text-amber-400/90'}`}>
                  {isUserAdmin ? '관리자 날짜 변경 가능' : 'KST 오늘만 가능'}
                </span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={isUserAdmin ? (e) => setDate(e.target.value) : undefined}
                  readOnly={!isUserAdmin}
                  title={isUserAdmin ? '등록할 날짜를 선택할 수 있습니다.' : '식사는 한국 시간 오늘 날짜에만 등록 가능합니다.'}
                  className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isUserAdmin
                      ? 'bg-slate-950 border border-slate-700 text-white focus:border-amber-500 cursor-pointer'
                      : 'bg-slate-950/80 border border-slate-800 text-slate-300 cursor-not-allowed'
                  }`}
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
                    onClick={() => {
                      setImagePreview(null);
                      setSelectedFile(null);
                      setExifInfo(null);
                      setExifRejectInfo(null);
                    }}
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
                      {isUserAdmin ? (
                        <span className="text-amber-400/90 font-semibold">
                          🛡️ 관리자 권한: 적정 시간대 외 사진, 카톡 사진, 스크린샷 업로드 가능
                        </span>
                      ) : (
                        '카메라 원본 또는 카카오톡 다운로드 사진 (스크린샷 업로드 불가)'
                      )}
                    </p>
                  </div>
                )}
              </label>
            )}

            {/* 업로드 거부 로그 (스크린샷 감지, EXIF 누락, 촬영 일시 불일치 시 사진 영역 바로 밑에 출력) */}
            {exifRejectInfo && (
              <div className="mt-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-semibold text-rose-400 bg-rose-950/60 border border-rose-500/40 px-3.5 py-2.5 rounded-xl animate-fade-in shadow-sm">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{exifRejectInfo.reason}</span>
                </div>
                {!isUserAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowInlineAdminLogin(true);
                      setInlineAdminId('aaa');
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Lock className="w-3 h-3 text-amber-400" />
                    관리자 로그인으로 즉시 승인
                  </button>
                )}
              </div>
            )}

            {/* 업로드 승인 로그 (촬영 일시 확인 완료 시 사진 영역 바로 밑에 출력) */}
            {exifInfo && imagePreview && (
              <div
                className={`mt-2.5 flex items-center space-x-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl animate-fade-in shadow-sm ${
                  exifInfo.isAdminBypass
                    ? 'text-amber-300 bg-amber-950/60 border border-amber-500/40'
                    : 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30'
                }`}
              >
                {exifInfo.isAdminBypass ? (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                )}
                <span>
                  {exifInfo.isAdminBypass ? (
                    <>
                      <strong>[관리자 권한 승인]</strong> 메타데이터 검증 우회 ({exifInfo.bypassReason}) :{' '}
                      <strong className="text-white">{exifInfo.photoDate} {exifInfo.photoTime}</strong>
                    </>
                  ) : exifInfo.sourceType === 'kakaotalk' ? (
                    <>카카오톡 저장 사진 일시 확인 완료 : <strong className="text-white">{exifInfo.photoDate} {exifInfo.photoTime}</strong></>
                  ) : exifInfo.sourceType === 'live_camera' ? (
                    <>실시간 카메라 촬영 일시 확인 완료 : <strong className="text-white">{exifInfo.photoDate} {exifInfo.photoTime}</strong></>
                  ) : (
                    <>카메라 원본 촬영 일시 확인 완료 : <strong className="text-white">{exifInfo.photoDate} {exifInfo.photoTime}</strong></>
                  )}
                </span>
              </div>
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
                  (!isUserAdmin && !checkCanRegisterMeal(date, slot).canRegister)
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
