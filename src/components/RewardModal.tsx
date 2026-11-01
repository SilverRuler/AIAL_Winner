'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Coins,
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  Check,
  Copy,
  Calendar,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Wallet,
  Sparkles,
  Info,
} from 'lucide-react';
import { RewardItem } from '@/types/meal';
import { MEMBERS, getMemberInfo } from '@/constants/members';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMember?: string | null;
  isAdmin?: boolean;
}

export const RewardModal: React.FC<RewardModalProps> = ({
  isOpen,
  onClose,
  initialMember,
  isAdmin = false,
}) => {
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 관리자 등록 / 수정 폼 상태
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [formMember, setFormMember] = useState<string>(MEMBERS[0].name);
  const [formAmount, setFormAmount] = useState<string>('0.05');
  const [formUnit, setFormUnit] = useState<string>('SOL');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formTxHash, setFormTxHash] = useState<string>('');
  const [formDate, setFormDate] = useState<string>('');
  const [formMemo, setFormMemo] = useState<string>('');
  const [formRecipientWallet, setFormRecipientWallet] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Record<string, boolean>>({});
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState<Record<string, boolean>>({});

  const toggleSnapshot = (id: string) => {
    setExpandedSnapshots((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleRefreshSnapshot = async (reward: RewardItem) => {
    setIsRefreshingSnapshot((prev) => ({ ...prev, [reward.id]: true }));
    try {
      const res = await fetch('/api/rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reward.id, txHash: reward.txHash }),
      });
      const data = await res.json();
      if (data.success && data.snapshot) {
        setRewards((prev) =>
          prev.map((r) => (r.id === reward.id ? { ...r, onChainSnapshot: data.snapshot } : r))
        );
        setExpandedSnapshots((prev) => ({ ...prev, [reward.id]: true }));
      } else {
        alert(data.message || '스냅샷 박제 실패');
      }
    } catch (e: any) {
      alert('스냅샷 추출 중 오류가 발생했습니다.');
    } finally {
      setIsRefreshingSnapshot((prev) => ({ ...prev, [reward.id]: false }));
    }
  };

  // 모달 열릴 때 초기 멤버 동기화 및 오늘 날짜 설정
  useEffect(() => {
    if (isOpen) {
      if (initialMember && MEMBERS.some((m) => m.name === initialMember)) {
        setSelectedMember(initialMember);
        setFormMember(initialMember);
      } else {
        setSelectedMember('all');
        setFormMember(MEMBERS[0].name);
      }
      const today = new Date().toISOString().split('T')[0];
      setFormDate(today);
      setIsFormOpen(false);
      setEditingRewardId(null);
      fetchRewards();
    }
  }, [isOpen, initialMember]);

  // ESC 키 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 리워드 목록 조회
  const fetchRewards = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      if (data.success && Array.isArray(data.rewards)) {
        setRewards(data.rewards);
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 선택된 멤버별 필터링
  const filteredRewards = useMemo(() => {
    if (selectedMember === 'all') return rewards;
    return rewards.filter((r) => r.member === selectedMember);
  }, [rewards, selectedMember]);

  // 누적 통계 계산
  const totalAmount = useMemo(() => {
    return filteredRewards.reduce((sum, r) => sum + (r.amount || 0), 0);
  }, [filteredRewards]);

  // 트랜잭션 해시 클립보드 복사
  const handleCopyTx = (txHash: string, id: string) => {
    navigator.clipboard.writeText(txHash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 폼 열기 (신규 등록)
  const handleOpenAddForm = () => {
    setEditingRewardId(null);
    setFormMember(selectedMember !== 'all' ? selectedMember : MEMBERS[0].name);
    setFormAmount('0.05');
    setFormUnit('SOL');
    setFormTitle(
      selectedMember !== 'all'
        ? `${selectedMember}님 식사 배틀 우승 상금`
        : '식사 배틀 우승 리워드'
    );
    setFormTxHash('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormMemo('');
    setFormRecipientWallet('');
    setFormError('');
    setIsFormOpen(true);
  };

  // 폼 열기 (수정)
  const handleOpenEditForm = (item: RewardItem) => {
    setEditingRewardId(item.id);
    setFormMember(item.member);
    setFormAmount(String(item.amount));
    setFormUnit(item.unit || 'SOL');
    setFormTitle(item.title);
    setFormTxHash(item.txHash);
    setFormDate(item.date);
    setFormMemo(item.memo || '');
    setFormRecipientWallet(item.recipientWallet || '');
    setFormError('');
    setIsFormOpen(true);
  };

  // 리워드 저장 (등록 / 수정)
  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formMember || !formTxHash.trim() || !formAmount) {
      setFormError('멤버, 지급 수량(SOL), 트랜잭션 해시는 필수 항목입니다.');
      return;
    }

    const numAmount = parseFloat(formAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('올바른 지급 수량을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        member: formMember,
        amount: numAmount,
        unit: formUnit.trim() || 'SOL',
        title: formTitle.trim() || '식사 배틀 리워드',
        txHash: formTxHash.trim(),
        date: formDate,
        memo: formMemo.trim(),
        recipientWallet: formRecipientWallet.trim(),
        adminId: 'aaa',
        adminPw: 'bbb',
      };

      const method = editingRewardId ? 'PUT' : 'POST';
      if (editingRewardId) {
        payload.id = editingRewardId;
      }

      const res = await fetch('/api/rewards', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setIsFormOpen(false);
        setEditingRewardId(null);
        await fetchRewards();
      } else {
        setFormError(data.message || '저장에 실패했습니다.');
      }
    } catch (err: any) {
      setFormError(err.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 리워드 삭제
  const handleDeleteReward = async (id: string) => {
    if (!confirm('정말 이 리워드 지급 내역을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/rewards?id=${encodeURIComponent(id)}&adminId=aaa&adminPw=bbb`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setRewards((prev) => prev.filter((r) => r.id !== id));
      } else {
        alert(data.message || '삭제 실패');
      }
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* 모달 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border-b border-purple-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/20 ring-2 ring-purple-400/30 shrink-0">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 flex-wrap">
                <span>리워드(SOL) 지급 현황</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  Solana 온체인 검증
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                우승자에게 실제로 지급된 솔라나(SOL) 트랜잭션을 Solscan에서 실시간 검증합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 멤버 탭 필터 */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 min-w-max">
            <button
              type="button"
              onClick={() => setSelectedMember('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedMember === 'all'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              전체 보기 ({rewards.length})
            </button>
            {MEMBERS.map((m) => {
              const count = rewards.filter((r) => r.member === m.name).length;
              const isSelected = selectedMember === m.name;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMember(m.name)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-300'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                  }`}
                >
                  <span>{m.name}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-purple-500/20 text-purple-300'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 지급 요약 배너 및 관리자 추가 버튼 */}
        <div className="p-4 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">
                {selectedMember === 'all' ? '전체 멤버 리워드 누적 지급액' : `${selectedMember}님의 누적 리워드`}
              </div>
              <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-300 font-mono">
                  {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  (총 {filteredRewards.length}회 지급 완료)
                </span>
              </div>
            </div>
          </div>

          {/* 관리자: 내역 추가 버튼 */}
          {isAdmin && !isFormOpen && (
            <button
              type="button"
              onClick={handleOpenAddForm}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer w-full sm:w-auto justify-center shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>리워드 지급 내역 추가</span>
            </button>
          )}
        </div>

        {/* 관리자 등록 / 수정 폼 (열렸을 때) */}
        {isFormOpen && (
          <form
            onSubmit={handleSaveReward}
            className="p-4 sm:p-5 bg-purple-950/30 border-b border-purple-500/30 space-y-3.5 animate-fade-in shrink-0"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black text-purple-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>{editingRewardId ? '리워드 내역 수정' : '새 솔라나 리워드 지급 내역 등록'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                취소 ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* 멤버 선택 */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">지급 대상 멤버 *</label>
                <select
                  value={formMember}
                  onChange={(e) => setFormMember(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400"
                >
                  {MEMBERS.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 수량 */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">지급 수량 (SOL) *</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="예: 0.05"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400 font-mono"
                />
              </div>

              {/* 지급 사유 / 타이틀 */}
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-bold mb-1">지급 사유 (제목) *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="예: 2026년 10월 4주차 식사 배틀 우승 상금"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400"
                />
              </div>

              {/* 솔라나 트랜잭션 해시 */}
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>솔라나 트랜잭션 해시 (Signature) *</span>
                  <span className="text-[11px] text-purple-400 font-normal">Solscan 바로가기 링크 생성</span>
                </label>
                <input
                  type="text"
                  value={formTxHash}
                  onChange={(e) => setFormTxHash(e.target.value)}
                  placeholder="예: 5VERv8NMvBoJmDXknPXdQA8UhAbU3agAvoUcCWdAYDwPBdpURvAepUq6hy2rYoh3BgW54yzNmbyjnptGL9KrZ7GW"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none focus:border-purple-400 placeholder-slate-600"
                />
              </div>

              {/* 지급 날짜 */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">지급 일자 (YYYY-MM-DD) *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400 [color-scheme:dark]"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">메모 / 비고 (선택)</label>
                <input
                  type="text"
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  placeholder="예: 팬텀 지갑 전송 완료"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <span>{editingRewardId ? '수정 완료' : '지급 내역 등록'}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* 리워드 목록 본문 */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Loader2 className="w-7 h-7 mx-auto animate-spin text-purple-400" />
              <p className="text-xs">리워드 지급 내역을 불러오는 중입니다...</p>
            </div>
          ) : filteredRewards.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                <Coins className="w-7 h-7" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {selectedMember === 'all'
                  ? '등록된 리워드 지급 내역이 없습니다.'
                  : `${selectedMember}님에게 아직 지급된 리워드 내역이 없습니다.`}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                식사 배틀에서 우승하여 승수를 쌓으면 주간/월간 리워드로 솔라나(SOL)가 지급됩니다!
              </p>
              {isAdmin && !isFormOpen && (
                <button
                  type="button"
                  onClick={handleOpenAddForm}
                  className="mt-2 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>첫 리워드 내역 등록하기</span>
                </button>
              )}
            </div>
          ) : (
            filteredRewards.map((reward) => {
              const memberInfo = getMemberInfo(reward.member);
              const solscanUrl = `https://solscan.io/tx/${encodeURIComponent(reward.txHash)}`;
              const shortHash =
                reward.txHash.length > 18
                  ? `${reward.txHash.slice(0, 8)}...${reward.txHash.slice(-8)}`
                  : reward.txHash;

              return (
                <div
                  key={reward.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/40 transition-all shadow-md space-y-3 group"
                >
                  {/* 상단: 멤버 정보, 일자, 금액 */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: memberInfo?.avatarBg || '#334155',
                          color: memberInfo?.textColor || '#ffffff',
                        }}
                      >
                        {reward.member}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {reward.date}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 font-mono flex items-center justify-end gap-1">
                        <span>+ {reward.amount} {reward.unit || 'SOL'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 제목 & 메모 */}
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-extrabold text-white">
                      {reward.title}
                    </h4>
                    {reward.memo && (
                      <p className="text-xs text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800 inline-block">
                        {reward.memo}
                      </p>
                    )}
                  </div>

                  {/* 솔라나 온체인 트랜잭션 Solscan 하이퍼링크 박스 */}
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 font-bold text-[10px]">
                        TX
                      </span>
                      <span className="font-mono text-slate-300 text-[11px] truncate select-all" title={reward.txHash}>
                        {shortHash}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyTx(reward.txHash, reward.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                        title="트랜잭션 해시 복사"
                      >
                        {copiedId === reward.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Solscan 바로가기 버튼 */}
                    <a
                      href={solscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-cyan-600/30 hover:from-purple-600/50 hover:to-cyan-600/50 border border-purple-500/40 hover:border-purple-400 text-purple-200 hover:text-white font-bold transition-all text-xs shrink-0 cursor-pointer shadow-sm"
                      title="Solscan 블록 익스플로러에서 트랜잭션 상세 정보 실시간 조회"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Solscan에서 확인</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  </div>

                  {/* 온체인 영구 박제 영수증 영역 (트랜잭션 만료/Truncate 대비 DB 영구 보존) */}
                  {reward.onChainSnapshot ? (
                    <div className="rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 text-xs space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </span>
                          <span className="font-bold text-emerald-300">
                            온체인 영수증 영구 박제 완료
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                            Slot #{reward.onChainSnapshot.slot}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRefreshSnapshot(reward)}
                              disabled={isRefreshingSnapshot[reward.id]}
                              className="text-[10px] text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
                              title="솔라나 RPC에서 스냅샷 다시 가져오기"
                            >
                              {isRefreshingSnapshot[reward.id] ? '동기화 중...' : '새로고침'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleSnapshot(reward.id)}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline flex items-center gap-1"
                          >
                            {expandedSnapshots[reward.id] ? '영수증 접기 ▲' : '영수증 상세 보기 ▼'}
                          </button>
                        </div>
                      </div>

                      {/* 영수증 상세 패널 (펼쳤을 때) */}
                      {expandedSnapshots[reward.id] && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1.5 font-mono text-[11px] text-slate-300">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <p>
                              <span className="text-slate-400">승인 상태: </span>
                              <span className="text-emerald-400 font-bold">✅ {reward.onChainSnapshot.status} (Finalized)</span>
                            </p>
                            <p>
                              <span className="text-slate-400">블록 슬롯: </span>
                              <span className="text-amber-300">#{reward.onChainSnapshot.slot}</span>
                            </p>
                            <p>
                              <span className="text-slate-400">온체인 승인 일시: </span>
                              <span>{reward.onChainSnapshot.blockTimeFormatted || '확인됨'}</span>
                            </p>
                            <p>
                              <span className="text-slate-400">트랜잭션 수수료: </span>
                              <span className="text-slate-200">{reward.onChainSnapshot.fee || '0.000005 SOL'}</span>
                            </p>
                          </div>

                          {reward.onChainSnapshot.sender && (
                            <p className="truncate" title={reward.onChainSnapshot.sender}>
                              <span className="text-slate-400">보낸 지갑 (Sender): </span>
                              <span className="text-cyan-300 select-all">{reward.onChainSnapshot.sender}</span>
                            </p>
                          )}

                          {reward.onChainSnapshot.recipient && (
                            <p className="truncate" title={reward.onChainSnapshot.recipient}>
                              <span className="text-slate-400">수신 지갑 (Recipient): </span>
                              <span className="text-cyan-300 select-all">{reward.onChainSnapshot.recipient}</span>
                            </p>
                          )}

                          <div className="pt-1.5 text-[10px] text-slate-400 border-t border-slate-900 flex items-center gap-1 font-sans">
                            <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>
                              블록체인에서 추출하여 MongoDB에 영구 박제된 데이터입니다. 향후 Solscan에서 해당 트랜잭션이 만료(Truncate)되더라도 증빙 효력을 유지합니다.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    isAdmin && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                        <span>온체인 스냅샷이 아직 박제되지 않았습니다.</span>
                        <button
                          type="button"
                          onClick={() => handleRefreshSnapshot(reward)}
                          disabled={isRefreshingSnapshot[reward.id]}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isRefreshingSnapshot[reward.id] ? '스냅샷 추출 중...' : '온체인 스냅샷 박제'}</span>
                        </button>
                      </div>
                    )
                  )}

                  {/* 관리자 수정/삭제 버튼 */}
                  {isAdmin && (
                    <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-900 text-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(reward)}
                        className="p-1 text-slate-400 hover:text-purple-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>수정</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReward(reward.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Solscan 링크를 누르면 온체인 전송 증빙을 실시간 확인할 수 있습니다.</span>
          </div>
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
