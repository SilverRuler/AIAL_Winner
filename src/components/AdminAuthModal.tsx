'use client';

import React, { useState } from 'react';
import { X, Lock, AlertCircle, Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { MEMBERS } from '@/constants/members';

export type AdminActionType = 'delete' | 'edit';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: AdminActionType;
  title: string;
  isOwner?: boolean;
  isAdminLoggedIn?: boolean;
  onConfirm: (
    adminId: string,
    adminPw: string,
    editData?: { menuName: string; comment: string; member?: string }
  ) => Promise<void>;
  initialMenuName?: string;
  initialComment?: string;
  initialMember?: string;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  actionType,
  title,
  isOwner = false,
  isAdminLoggedIn = false,
  onConfirm,
  initialMenuName = '',
  initialComment = '',
  initialMember = '',
}) => {
  const [adminId, setAdminId] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [menuName, setMenuName] = useState(initialMenuName);
  const [comment, setComment] = useState(initialComment);
  const [member, setMember] = useState(initialMember);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 세션/로컬스토리지에 이미 관리자 로그인 되어있는지 확인
  const hasSavedAdminSession = React.useMemo(() => {
    if (isAdminLoggedIn) return true;
    if (typeof window === 'undefined') return false;
    return (
      sessionStorage.getItem('aial_is_admin') === 'true' ||
      localStorage.getItem('aial_is_admin') === 'true' ||
      sessionStorage.getItem('aial_admin_id') === 'aaa' ||
      localStorage.getItem('aial_admin_id') === 'aaa'
    );
  }, [isAdminLoggedIn, isOpen]);

  // 본인 작성 기기이거나 관리자 로그인 상태면 별도 비밀번호 입력 불필요
  const requiresAdminInput = !isOwner && !hasSavedAdminSession;
  const canChangeMember = hasSavedAdminSession || requiresAdminInput;

  React.useEffect(() => {
    if (isOpen) {
      setAdminId('');
      setAdminPw('');
      setMenuName(initialMenuName);
      setComment(initialComment);
      setMember(initialMember);
      setErrorMsg('');
    }
  }, [isOpen, initialMenuName, initialComment, initialMember]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let effAdminId = adminId.trim();
    let effAdminPw = adminPw.trim();

    if (requiresAdminInput) {
      if (!effAdminId || !effAdminPw) {
        setErrorMsg('관리자 아이디와 비밀번호를 모두 입력해주세요.');
        return;
      }
    } else if (hasSavedAdminSession) {
      effAdminId =
        (typeof window !== 'undefined' &&
          (sessionStorage.getItem('aial_admin_id') || localStorage.getItem('aial_admin_id'))) ||
        'aaa';
      effAdminPw =
        (typeof window !== 'undefined' &&
          (sessionStorage.getItem('aial_admin_pw') || localStorage.getItem('aial_admin_pw'))) ||
        'bbb';
    } else {
      // 작성자 본인 기기 인증 모드: 관리자 자격 증명 없이 서버의 기기/IP/UA 검증으로 처리
      effAdminId = '';
      effAdminPw = '';
    }

    try {
      setIsSubmitting(true);
      if (typeof window !== 'undefined' && effAdminId === 'aaa' && effAdminPw === 'bbb') {
        sessionStorage.setItem('aial_is_admin', 'true');
        sessionStorage.setItem('aial_admin_id', 'aaa');
        sessionStorage.setItem('aial_admin_pw', 'bbb');
        localStorage.setItem('aial_is_admin', 'true');
        localStorage.setItem('aial_admin_id', 'aaa');
        localStorage.setItem('aial_admin_pw', 'bbb');
      }
      await onConfirm(
        effAdminId,
        effAdminPw,
        actionType === 'edit'
          ? { menuName, comment, member: canChangeMember ? member : undefined }
          : undefined
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '인증 또는 처리에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                actionType === 'delete'
                  ? 'bg-rose-500/20 text-rose-400'
                  : isOwner && !hasSavedAdminSession
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {hasSavedAdminSession ? (
                <ShieldCheck className="w-4 h-4" />
              ) : isOwner ? (
                <UserCheck className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {isOwner && !hasSavedAdminSession
                  ? actionType === 'delete'
                    ? '내 식사 게시글 삭제'
                    : '내 식사 게시글 수정'
                  : actionType === 'delete'
                  ? '식사 기록 삭제'
                  : '식사 기록 수정'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {hasSavedAdminSession
                  ? `관리자 권한으로 바로 ${actionType === 'delete' ? '삭제' : '수정'}합니다.`
                  : isOwner
                  ? `본인 작성 기기 인증됨 · 바로 ${actionType === 'delete' ? '삭제' : '수정'}할 수 있습니다.`
                  : `작성자 본인 기기 또는 관리자만 ${actionType === 'delete' ? '삭제' : '수정'}할 수 있습니다.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {actionType === 'delete' ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 font-medium">
                삭제 대상: <span className="text-rose-400 font-bold">{title}</span>
              </div>
              {isOwner && !hasSavedAdminSession && (
                <p className="text-[11px] text-slate-400 leading-relaxed px-1">
                  삭제 후에도 해당 타임대가 마감 전이라면 다시 등록할 수 있습니다. (뽑기권은 타임당 최초 1회만 지급됩니다.)
                </p>
              )}
            </div>
          ) : (
            /* 수정 모드: 메뉴명, 코멘트 수정 (+ 관리자일 때만 대상 멤버 변경) */
            <div className="space-y-3 pt-1">
              {canChangeMember && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      작성 멤버 (대상 변경)
                    </label>
                    {member && (
                      <span className="text-xs font-bold text-amber-400">
                        선택: {member}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-950 rounded-xl border border-slate-800">
                    {MEMBERS.map((m) => {
                      const isSelected = member === m.name;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMember(m.name)}
                          className={`py-1.5 px-1.5 rounded-lg text-xs font-bold border transition-all text-center truncate cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm scale-102'
                              : `${m.avatarBg} ${m.borderColor} hover:border-slate-500`
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 메뉴 이름 */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  메뉴 이름
                </label>
                <input
                  type="text"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="예: 오늘의 한 끼"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* 한 줄 코멘트 */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  한 줄 코멘트
                </label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="코멘트 입력"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* 관리자 ID & PW (본인 작성 기기가 아니고 관리자 로그인도 안 된 경우에만 표시) */}
          {requiresAdminInput && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  관리자 ID
                </label>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  placeholder="ID 입력"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  관리자 비밀번호
                </label>
                <input
                  type="password"
                  value={adminPw}
                  onChange={(e) => setAdminPw(e.target.value)}
                  placeholder="비밀번호 입력"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center space-x-1.5 cursor-pointer ${
                actionType === 'delete'
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>처리 중...</span>
                </>
              ) : (
                <span>{actionType === 'delete' ? '삭제 확인' : '수정 완료'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
