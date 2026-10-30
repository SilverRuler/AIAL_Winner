'use client';

import React, { useState } from 'react';
import { X, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { MEMBERS } from '@/constants/members';

export type AdminActionType = 'delete' | 'edit';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: AdminActionType;
  title: string;
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

    if (!adminId.trim() || !adminPw.trim()) {
      setErrorMsg('관리자 아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(
        adminId.trim(),
        adminPw.trim(),
        actionType === 'edit' ? { menuName, comment, member } : undefined
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '인증 또는 처리에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                actionType === 'delete'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {actionType === 'delete' ? '식사 기록 삭제' : '식사 기록 수정'}
              </h3>
              <p className="text-[11px] text-slate-400">
                관리자만 {actionType === 'delete' ? '삭제' : '수정'}할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
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
            <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-medium">
              삭제 대상: <span className="text-rose-400 font-bold">{title}</span>
            </div>
          ) : (
            /* 수정 모드: 대상 멤버 변경, 메뉴명, 코멘트 수정 */
            <div className="space-y-3 pt-1">
              {/* 작성 멤버(대상) 변경 */}
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

          {/* 관리자 ID & PW */}
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
