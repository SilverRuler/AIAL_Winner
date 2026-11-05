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
  CheckCircle2,
  HelpCircle,
  Gift,
  ArrowRight,
  ArrowLeft,
  Trophy,
  ZoomIn,
} from 'lucide-react';
import { RewardItem, MemberWinStats } from '@/types/meal';
import { MEMBERS, LEGACY_MEMBERS, getMemberInfo } from '@/constants/members';
import { getRandomQuizzes, QuizQuestion, REWARD_QUIZ_POOL } from '@/constants/quizzes';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMember?: string | null;
  isAdmin?: boolean;
  memberWinStats?: MemberWinStats[];
}

export const RewardModal: React.FC<RewardModalProps> = ({
  isOpen,
  onClose,
  initialMember,
  isAdmin = false,
  memberWinStats = [],
}) => {
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 화면 모드: 'history' (Page A) | 'intro' (최소 승수/신청 안내) | 'quiz1' (문제 1) | 'quiz2' (문제 2) | 'apply' (승수 신청)
  const [viewMode, setViewMode] = useState<'history' | 'intro' | 'quiz1' | 'quiz2' | 'apply'>('history');

  // 활성화된 랜덤 퀴즈 2문제
  const [activeQuizzes, setActiveQuizzes] = useState<QuizQuestion[]>([]);
  const [quizBackNotice, setQuizBackNotice] = useState<string>('');

  // 퀴즈 1 (주관식/객관식 공용)
  const [quiz1Answer, setQuiz1Answer] = useState<string>('');
  const [quiz1Selected, setQuiz1Selected] = useState<number | null>(null);
  const [quiz1Error, setQuiz1Error] = useState<string>('');

  // 퀴즈 2 (주관식/객관식 공용)
  const [quiz2Answer, setQuiz2Answer] = useState<string>('');
  const [quiz2Selected, setQuiz2Selected] = useState<number | null>(null);
  const [quiz2Error, setQuiz2Error] = useState<string>('');

  // 리워드 승수 신청 폼 상태
  const [requestedWins, setRequestedWins] = useState<number>(5);
  const [applyWallet, setApplyWallet] = useState<string>('');
  const [applyMemo, setApplyMemo] = useState<string>('');
  const [applyError, setApplyError] = useState<string>('');
  const [isSubmittingApply, setIsSubmittingApply] = useState<boolean>(false);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string>('');

  // 이미지 확대 보기 상태
  const [isImageZoomed, setIsImageZoomed] = useState<boolean>(false);

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

  // 멤버별 기신청 차감 승수 맵
  const [memberUsedWins, setMemberUsedWins] = useState<Record<string, number>>({});

  // 현재 선택된 멤버의 실제 총 승수 (변하지 않음)
  const userWins = useMemo(() => {
    if (selectedMember === 'all') return 0;
    const found = memberWinStats.find((s) => s.member === selectedMember);
    return found ? found.totalWins : 0;
  }, [selectedMember, memberWinStats]);

  // 현재 선택된 멤버의 기신청 차감 승수
  const usedWins = useMemo(() => {
    if (selectedMember === 'all') return 0;
    return memberUsedWins[selectedMember] || 0;
  }, [selectedMember, memberUsedWins]);

  // 남은 신청 가능 리워드 승수 (자신의 총 승수는 불변, 신청 가능 수만 차감)
  const availableWins = useMemo(() => {
    return Math.max(0, userWins - usedWins);
  }, [userWins, usedWins]);

  // 5Win 단위 최대 신청 가능 승수
  const maxClaimableWins = useMemo(() => {
    return Math.floor(availableWins / 5) * 5;
  }, [availableWins]);

  // 신청 가능한 5Win 단위 옵션 목록
  const allowedWinOptions = useMemo(() => {
    if (maxClaimableWins < 5) return [5];
    const opts: number[] = [];
    for (let w = 5; w <= maxClaimableWins; w += 5) {
      opts.push(w);
    }
    return opts;
  }, [maxClaimableWins]);

  // 승수 변경 시 기본 선택값 동기화
  useEffect(() => {
    if (maxClaimableWins >= 5) {
      setRequestedWins(maxClaimableWins);
    } else {
      setRequestedWins(5);
    }
  }, [maxClaimableWins]);

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
      const isKnownMember =
        initialMember &&
        (MEMBERS.some((m) => m.name === initialMember) ||
          LEGACY_MEMBERS.some((m) => m.name === initialMember));

      const targetMem = initialMember && isKnownMember ? initialMember : 'all';
      setSelectedMember(targetMem);
      setFormMember(
        initialMember && MEMBERS.some((m) => m.name === initialMember)
          ? initialMember
          : MEMBERS[0].name
      );

      // 모드 결정:
      // 특정 멤버를 눌렀고 아직 리워드 신청을 완료한 적이 없다면 intro 모드로 시작
      if (targetMem !== 'all') {
        const hasApplied =
          typeof window !== 'undefined' &&
          localStorage.getItem(`aial_reward_applied_${targetMem}`) === 'true';

        if (!hasApplied) {
          setViewMode('intro');
        } else {
          setViewMode('history');
        }
      } else {
        setViewMode('history');
      }

      setActiveQuizzes(getRandomQuizzes(2));
      setQuiz1Answer('');
      setQuiz1Selected(null);
      setQuiz1Error('');
      setQuiz2Answer('');
      setQuiz2Selected(null);
      setQuiz2Error('');
      setQuizBackNotice('');
      setApplySuccessMsg('');
      setApplyError('');
      setIsImageZoomed(false);

      const today = new Date().toISOString().split('T')[0];
      setFormDate(today);
      setIsFormOpen(false);
      setEditingRewardId(null);
      fetchRewards();
      fetchApplications();
    }
  }, [isOpen, initialMember]);

  // 멤버 탭 선택 시 처리
  const handleSelectMemberTab = (memberName: string) => {
    setSelectedMember(memberName);
    setIsFormOpen(false);
    setApplySuccessMsg('');
    if (memberName === 'all') {
      setViewMode('history');
    } else {
      const hasApplied =
        typeof window !== 'undefined' &&
        localStorage.getItem(`aial_reward_applied_${memberName}`) === 'true';

      if (!hasApplied) {
        setViewMode('intro');
      } else {
        setViewMode('history');
      }
    }
  };

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

  // 리워드 신청 내역 및 기신청 차감 승수 조회
  const fetchApplications = async () => {
    try {
      const res = await fetch('/api/rewards/apply');
      const data = await res.json();
      if (data.success && data.memberUsedWins) {
        setMemberUsedWins(data.memberUsedWins);
      }
    } catch (err) {
      console.error('Failed to fetch applications:', err);
    }
  };

  // 트랜잭션 해시 복사
  const handleCopyTx = (txHash: string, id: string) => {
    navigator.clipboard.writeText(txHash);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // 4문제 중 2문제 무작위 추출하여 퀴즈 시작
  const handleStartQuiz = () => {
    setActiveQuizzes(getRandomQuizzes(2));
    setQuiz1Answer('');
    setQuiz1Selected(null);
    setQuiz1Error('');
    setQuiz2Answer('');
    setQuiz2Selected(null);
    setQuiz2Error('');
    setQuizBackNotice('');
    setViewMode('quiz1');
  };

  // 퀴즈 1 검증: 주관식/객관식 범용 처리 (패널티 없음)
  const handleCheckQuiz1 = () => {
    const currentQuiz = activeQuizzes[0];
    if (!currentQuiz) return;

    if (currentQuiz.type === 'subjective') {
      const isValid = currentQuiz.validateSubjective
        ? currentQuiz.validateSubjective(quiz1Answer)
        : false;

      if (isValid) {
        setQuiz1Error('');
        setQuizBackNotice('');
        setViewMode('quiz2');
      } else {
        setQuiz1Error('정답이 아닙니다. 다시 입력해주세요! (패널티 없음)');
      }
    } else {
      if (quiz1Selected === null) {
        setQuiz1Error('보기를 선택한 후 정답을 제출해주세요.');
        return;
      }
      if (quiz1Selected === currentQuiz.correctOption) {
        setQuiz1Error('');
        setQuizBackNotice('');
        setViewMode('quiz2');
      } else {
        setQuiz1Error('오답입니다. 다시 선택해보세요! (패널티 없음)');
      }
    }
  };

  // 퀴즈 2 검증: 정답 시 apply 단계 진입, 오답 시 "첫 번째 문제로 돌아간다" (패널티 없음, 재배치)
  const handleSubmitQuiz2 = () => {
    const currentQuiz = activeQuizzes[1];
    if (!currentQuiz) return;

    let isCorrect = false;
    if (currentQuiz.type === 'subjective') {
      isCorrect = currentQuiz.validateSubjective
        ? currentQuiz.validateSubjective(quiz2Answer)
        : false;
    } else {
      if (quiz2Selected === null) {
        setQuiz2Error('보기를 선택한 후 정답을 제출해주세요.');
        return;
      }
      isCorrect = quiz2Selected === currentQuiz.correctOption;
    }

    if (isCorrect) {
      setQuiz2Error('');
      setQuizBackNotice('');
      setViewMode('apply');
    } else {
      // ⚠️ 두 번째 문제를 틀렸을 경우 첫 번째 문제로 돌아간다! (패널티 없음)
      setQuizBackNotice('2번 문제 오답입니다! 규정에 따라 1번 문제로 돌아갑니다. (패널티 없음, 다시 도전해보세요!)');
      setActiveQuizzes(getRandomQuizzes(2));
      setQuiz1Answer('');
      setQuiz1Selected(null);
      setQuiz1Error('');
      setQuiz2Answer('');
      setQuiz2Selected(null);
      setQuiz2Error('');
      setViewMode('quiz1');
    }
  };

  // 리워드 승수 신청 제출
  const handleSubmitApply = async () => {
    if (selectedMember === 'all') return;

    if (!applyWallet.trim()) {
      setApplyError('솔라나(SOL) 지갑 주소를 필수로 입력해주세요.');
      return;
    }

    if (availableWins < 5) {
      setApplyError(`남은 신청 가능 리워드가 5Win 미만(현재 ${availableWins}Win)이므로 신청할 수 없습니다.`);
      return;
    }
    if (!requestedWins || requestedWins < 5 || requestedWins % 5 !== 0) {
      setApplyError('5Win 단위로만 신청 가능합니다.');
      return;
    }
    if (requestedWins > maxClaimableWins) {
      setApplyError(`최대 ${maxClaimableWins}Win까지만 신청 가능합니다. (남은 신청 가능 리워드: ${availableWins}Win)`);
      return;
    }

    setIsSubmittingApply(true);
    setApplyError('');
    try {
      const res = await fetch('/api/rewards/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member: selectedMember,
          requestedWins,
          walletAddress: applyWallet.trim(),
          memo: applyMemo.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`aial_reward_applied_${selectedMember}`, 'true');
        }
        await fetchApplications();
        const remaining = typeof data.remainingAvailableWins === 'number' ? data.remainingAvailableWins : availableWins - requestedWins;
        setApplySuccessMsg(
          `${selectedMember}님의 ${requestedWins}Win 리워드 신청이 성공적으로 접수되었습니다! (남은 신청 가능 리워드 WIN: ${remaining})`
        );
        setViewMode('history');
      } else {
        setApplyError(data.message || '신청 처리에 실패했습니다.');
      }
    } catch (e: any) {
      setApplyError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingApply(false);
    }
  };

  // Page A(지급 내역) 하단에서 다시 리워드 신청하기 클릭
  const handleOpenApplyFlow = () => {
    if (selectedMember === 'all') {
      alert('상단 멤버 탭에서 신청할 멤버를 먼저 선택해주세요.');
      return;
    }
    if (availableWins < 5) {
      setViewMode('intro');
      return;
    }
    // availableWins >= 5 이면 퀴즈 1로 바로 진입
    setQuiz1Answer('');
    setQuiz1Error('');
    setQuiz2Selected(null);
    setQuiz2Error('');
    setApplyError('');
    setViewMode('quiz1');
  };

  // 관리자 등록 폼 열기
  const handleOpenAddForm = () => {
    setEditingRewardId(null);
    setFormMember(selectedMember !== 'all' ? selectedMember : MEMBERS[0].name);
    setFormAmount('0.05');
    setFormUnit('SOL');
    setFormTitle('');
    setFormTxHash('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormMemo('');
    setFormRecipientWallet('');
    setFormError('');
    setIsFormOpen(true);
  };

  // 관리자 수정 폼 열기
  const handleOpenEditForm = (reward: RewardItem) => {
    setEditingRewardId(reward.id);
    setFormMember(reward.member);
    setFormAmount(reward.amount.toString());
    setFormUnit(reward.unit || 'SOL');
    setFormTitle(reward.title);
    setFormTxHash(reward.txHash);
    setFormDate(reward.date);
    setFormMemo(reward.memo || '');
    setFormRecipientWallet(reward.recipientWallet || '');
    setFormError('');
    setIsFormOpen(true);
  };

  // 관리자 저장 처리
  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formMember.trim()) {
      setFormError('멤버를 선택해주세요.');
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('지급 수량(SOL)을 올바르게 입력해주세요.');
      return;
    }
    if (!formTxHash.trim()) {
      setFormError('솔라나 트랜잭션 해시(Signature)를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        member: formMember.trim(),
        amount: amt,
        unit: formUnit.trim() || 'SOL',
        title: formTitle.trim() || `${formMember} 우승 리워드 지급`,
        txHash: formTxHash.trim(),
        date: formDate.trim() || new Date().toISOString().split('T')[0],
        memo: formMemo.trim(),
        recipientWallet: formRecipientWallet.trim(),
      };

      let res;
      if (editingRewardId) {
        res = await fetch('/api/rewards', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingRewardId, ...payload }),
        });
      } else {
        res = await fetch('/api/rewards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        setIsFormOpen(false);
        setEditingRewardId(null);
        await fetchRewards();
      } else {
        setFormError(data.message || '저장 실패');
      }
    } catch (err: any) {
      setFormError(err.message || '서버 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 관리자 삭제 처리
  const handleDeleteReward = async (id: string) => {
    if (!confirm('이 리워드 지급 내역을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/rewards?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchRewards();
      } else {
        alert(data.message || '삭제 실패');
      }
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 필터링된 리워드 목록
  const filteredRewards = useMemo(() => {
    if (selectedMember === 'all') return rewards;
    return rewards.filter((r) => r.member === selectedMember);
  }, [rewards, selectedMember]);

  // 누적 지급액 합산
  const totalAmount = useMemo(() => {
    return filteredRewards.reduce((sum, r) => sum + (r.amount || 0), 0);
  }, [filteredRewards]);

  const selectedMemberInfo = useMemo(() => {
    return getMemberInfo(selectedMember);
  }, [selectedMember]);

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
              onClick={() => handleSelectMemberTab('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedMember === 'all'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              전체 보기 ({rewards.length})
            </button>
            {/* 활동 멤버 및 과거 리워드 이력/선택된 레거시 멤버 탭 */}
            {[
              ...MEMBERS,
              ...LEGACY_MEMBERS.filter(
                (lm) =>
                  rewards.some((r) => r.member === lm.name) ||
                  selectedMember === lm.name
              ),
            ].map((m) => {
              const count = rewards.filter((r) => r.member === m.name).length;
              const isSelected = selectedMember === m.name;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMemberTab(m.name)}
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

        {/* 1. 인트로 화면 (5Win 미만 안내 or 5Win 이상 신청 가능 안내) */}
        {viewMode === 'intro' && selectedMember !== 'all' && (
          <div className="p-6 sm:p-8 flex-1 overflow-y-auto flex flex-col justify-center items-center text-center space-y-5 animate-fade-in my-auto">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl mx-auto flex items-center justify-center shadow-2xl ring-2 ${
                availableWins >= 5
                  ? 'bg-gradient-to-tr from-purple-600 to-indigo-500 text-white ring-purple-400/40 shadow-purple-500/20'
                  : 'bg-slate-800 text-slate-400 ring-slate-700 shadow-slate-900/40'
              }`}
            >
              {availableWins >= 5 ? (
                <Gift className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-bounce" />
              ) : (
                <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
              )}
            </div>

            <div className="space-y-2">
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-black shadow-sm ${selectedMemberInfo.avatarBg} ${selectedMemberInfo.borderColor}`}
              >
                <span>{selectedMember}</span>
                <span className="text-amber-400 font-mono">(총 {userWins} Win)</span>
                <span className="text-cyan-300 font-mono font-bold">
                  [신청 가능: {availableWins} Win]
                </span>
              </div>

              {availableWins < 5 ? (
                <div className="space-y-2.5 pt-1">
                  <h3 className="text-base sm:text-lg font-black text-rose-400 leading-snug">
                    5Win 미만은 리워드를 받기 위한 최소 승수를 채우지 못했습니다.
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    솔라나(SOL) 온체인 리워드는 <strong className="text-purple-300 font-bold">5Win 단위</strong>로 신청하실 수 있습니다.
                    현재 {selectedMember}님의 총 승수는 <strong className="text-amber-400">{userWins}Win</strong>이며,
                    {usedWins > 0 && (
                      <span className="text-slate-300"> (기존에 {usedWins}Win 신청 완료) </span>
                    )}
                    <span className="block mt-1">
                      남은 신청 가능 리워드 WIN은 <strong className="text-cyan-300 font-bold">{availableWins}</strong>입니다.
                    </span>
                    앞으로 <strong className="text-rose-300 font-bold">{5 - (availableWins % 5)}Win</strong>을 더 달성하시면 추가 리워드 신청이 가능합니다!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  <h3 className="text-base sm:text-lg font-black text-emerald-400 leading-snug">
                    리워드를 신청할 수 있습니다.
                  </h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    축하합니다! {selectedMember}님의 총 승수는 <strong className="text-amber-400 font-bold">{userWins}Win</strong>이며,
                    {usedWins > 0 && (
                      <span className="text-slate-400"> (기신청 {usedWins}Win 제외) </span>
                    )}
                    현재 <strong className="text-cyan-300 font-bold">남은 신청 가능 리워드 WIN은 {availableWins}</strong> (최대 {maxClaimableWins}Win 신청 가능)입니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-3 w-full max-w-xs sm:max-w-md">
              {availableWins >= 5 && (
                <button
                  type="button"
                  onClick={handleStartQuiz}
                  className="w-full sm:flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-sm shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gift className="w-4 h-4" />
                  <span>신청하기</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('history')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
              >
                지급 내역 확인하기
              </button>
            </div>
          </div>
        )}

        {/* 2. 문제 1 화면 (랜덤 출제: 주관식 or 객관식) */}
        {viewMode === 'quiz1' && (() => {
          const q1 = activeQuizzes[0] || REWARD_QUIZ_POOL[0];
          return (
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 animate-fade-in">
              {/* 상단 스텝 프로그레스 */}
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span className="font-black text-purple-400 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  <span>리워드 신청 퀴즈 (1/2단계)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode('history')}
                  className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
                >
                  지급 내역으로 돌아가기
                </button>
              </div>

              {/* 2번 문제에서 틀려서 1번으로 돌아왔을 때의 안내 알림 */}
              {quizBackNotice && (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2 animate-fade-in shadow-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{quizBackNotice}</span>
                </div>
              )}

              {/* 안내 이미지 (/reward.png) */}
              {q1.showGuideImage !== false && (
                <div className="space-y-1.5">
                  <div
                    className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-lg group cursor-pointer"
                    onClick={() => setIsImageZoomed(true)}
                    title="클릭하여 원본 크기로 확대 보기"
                  >
                    <img
                      src="/reward.png"
                      alt="리워드 안내"
                      className="w-full max-h-56 sm:max-h-64 object-contain mx-auto transition-transform group-hover:scale-[1.01]"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-sm text-slate-300 text-[10px] flex items-center gap-1 border border-white/10 pointer-events-none">
                      <ZoomIn className="w-3 h-3 text-cyan-300" />
                      <span>클릭하여 사진 확대</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    위 첨부된 이미지를 참고하여 아래 퀴즈를 풀어주세요.
                  </p>
                </div>
              )}

              {/* 문제 1 본문 박스 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-3.5 shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[11px] font-black">
                    문제 1 · {q1.type === 'subjective' ? '주관식' : '객관식'}
                  </span>
                  <span className="text-[11px] text-slate-400">틀려도 패널티 없음 (재도전 가능)</span>
                </div>

                <h3 className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                  {q1.question}
                </h3>

                {q1.type === 'subjective' ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={quiz1Answer}
                        onChange={(e) => {
                          setQuiz1Answer(e.target.value);
                          setQuiz1Error('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCheckQuiz1();
                        }}
                        placeholder={q1.placeholder || '정답 입력'}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm outline-none focus:border-purple-400 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleCheckQuiz1}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black transition-all shadow-md shadow-purple-600/30 cursor-pointer"
                      >
                        정답 확인
                      </button>
                    </div>

                    {quiz1Error && (
                      <p className="text-xs text-rose-400 font-bold flex items-center gap-1.5 animate-fade-in">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{quiz1Error}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    {q1.options?.map((opt) => {
                      const isSelected = quiz1Selected === opt.no;
                      return (
                        <button
                          key={opt.no}
                          type="button"
                          onClick={() => {
                            setQuiz1Selected(opt.no);
                            setQuiz1Error('');
                          }}
                          className={`w-full p-3 rounded-xl border text-left text-xs sm:text-sm font-bold transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/25 border-purple-400 text-white shadow-md ring-1 ring-purple-400'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-purple-400/60 hover:bg-slate-900'
                          }`}
                        >
                          <span>
                            {opt.no}) {opt.text}
                          </span>
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm" />
                          )}
                        </button>
                      );
                    })}

                    {quiz1Error && (
                      <p className="text-xs text-rose-400 font-bold flex items-center gap-1.5 animate-fade-in pt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{quiz1Error}</span>
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleCheckQuiz1}
                        disabled={quiz1Selected === null}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-black transition-all shadow-md shadow-purple-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <span>정답 확인</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 3. 문제 2 화면 (랜덤 출제: 주관식 or 객관식, 오답 시 1번 문제로 복귀) */}
        {viewMode === 'quiz2' && (() => {
          const q2 = activeQuizzes[1] || REWARD_QUIZ_POOL[1];
          return (
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 animate-fade-in">
              {/* 상단 스텝 프로그레스 */}
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span className="font-black text-cyan-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>리워드 신청 퀴즈 (2/2단계)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode('quiz1')}
                  className="text-slate-400 hover:text-white text-xs underline cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>문제 1로</span>
                </button>
              </div>

              {/* 안내 이미지 (/reward.png) */}
              {q2.showGuideImage !== false && (
                <div className="space-y-1.5">
                  <div
                    className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-lg group cursor-pointer"
                    onClick={() => setIsImageZoomed(true)}
                    title="클릭하여 원본 크기로 확대 보기"
                  >
                    <img
                      src="/reward.png"
                      alt="리워드 안내"
                      className="w-full max-h-56 sm:max-h-64 object-contain mx-auto transition-transform group-hover:scale-[1.01]"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-sm text-slate-300 text-[10px] flex items-center gap-1 border border-white/10 pointer-events-none">
                      <ZoomIn className="w-3 h-3 text-cyan-300" />
                      <span>클릭하여 사진 확대</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    위 첨부된 이미지를 참고하여 아래 퀴즈를 풀어주세요.
                  </p>
                </div>
              )}

              {/* 문제 2 본문 박스 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-3.5 shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-black">
                    문제 2 · {q2.type === 'subjective' ? '주관식' : '객관식'}
                  </span>
                  <span className="text-[11px] text-amber-300/90 font-semibold">
                    * 틀릴 경우 1번 문제로 돌아갑니다 (패널티 없음)
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                  {q2.question}
                </h3>

                {q2.type === 'subjective' ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={quiz2Answer}
                        onChange={(e) => {
                          setQuiz2Answer(e.target.value);
                          setQuiz2Error('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitQuiz2();
                        }}
                        placeholder={q2.placeholder || '정답 입력'}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm outline-none focus:border-indigo-400 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleSubmitQuiz2}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-xs font-black transition-all shadow-md shadow-purple-600/30 cursor-pointer"
                      >
                        정답 제출
                      </button>
                    </div>

                    {quiz2Error && (
                      <p className="text-xs text-rose-400 font-bold flex items-center gap-1.5 animate-fade-in">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{quiz2Error}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    {q2.options?.map((opt) => {
                      const isSelected = quiz2Selected === opt.no;
                      return (
                        <button
                          key={opt.no}
                          type="button"
                          onClick={() => {
                            setQuiz2Selected(opt.no);
                            setQuiz2Error('');
                          }}
                          className={`w-full p-3 rounded-xl border text-left text-xs sm:text-sm font-bold transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/25 border-purple-400 text-white shadow-md ring-1 ring-purple-400'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-purple-400/60 hover:bg-slate-900'
                          }`}
                        >
                          <span>
                            {opt.no}) {opt.text}
                          </span>
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm" />
                          )}
                        </button>
                      );
                    })}

                    {quiz2Error && (
                      <p className="text-xs text-rose-400 font-bold flex items-center gap-1.5 animate-fade-in pt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{quiz2Error}</span>
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSubmitQuiz2}
                        disabled={quiz2Selected === null}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-black transition-all shadow-md shadow-purple-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <span>정답 제출</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 4. 리워드 승수 신청 화면 (2문제 모두 정답 통과 후) */}
        {viewMode === 'apply' && (
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 animate-fade-in">
            {/* 정답 축하 배너 */}
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-emerald-300">
                  온체인 퀴즈를 모두 맞추셨습니다! 🎉
                </h4>
                <p className="text-[11px] text-emerald-400/80">
                  {selectedMember}님의 솔라나 리워드 신청 승수를 지정해주세요.
                </p>
              </div>
            </div>

            {/* 신청 카드 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-purple-500/30 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    몇 Win에 대한 리워드를 신청 하시겠습니까?
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    ※ 5Win 단위로 차감할 수 있습니다. (5의 배수가 아닌 숫자는 신청 불가)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">총 {userWins} Win 보유</span>
                  <span className="text-sm font-black text-cyan-300 font-mono">
                    남은 신청 가능 리워드 WIN: {availableWins}
                  </span>
                  {usedWins > 0 && (
                    <span className="text-[10px] text-slate-500 block">
                      (기신청 {usedWins}Win 차감됨)
                    </span>
                  )}
                </div>
              </div>

              {/* 5Win 단위 선택 버튼 그리드 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  신청 차감 승수 선택 (5Win 단위) *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {allowedWinOptions.map((win) => (
                    <button
                      key={win}
                      type="button"
                      onClick={() => setRequestedWins(win)}
                      className={`py-2 px-3 rounded-xl border font-black text-xs transition-all cursor-pointer ${
                        requestedWins === win
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400 text-white shadow-md shadow-purple-600/30 scale-102 ring-1 ring-purple-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {win} Win 신청
                    </button>
                  ))}
                </div>
              </div>

              {/* 솔라나 지갑 주소 (필수) */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>솔라나(SOL) 지갑 주소</span>
                  <span className="text-rose-400 font-black text-[11px]">* 필수 입력</span>
                </label>
                <input
                  type="text"
                  required
                  value={applyWallet}
                  onChange={(e) => {
                    setApplyWallet(e.target.value);
                    if (applyError) setApplyError('');
                  }}
                  placeholder="리워드를 수령할 본인의 솔라나(SOL) 지갑 주소를 입력해주세요"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-400 font-mono"
                />
              </div>

              {/* 메모 */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300">
                  신청자 메모 / 전달사항 (선택)
                </label>
                <input
                  type="text"
                  value={applyMemo}
                  onChange={(e) => setApplyMemo(e.target.value)}
                  placeholder="관리자에게 전달할 메모가 있다면 작성해주세요"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-400"
                />
              </div>

              {applyError && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{applyError}</span>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('history')}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  취소하고 지급 내역 보기
                </button>
                <button
                  type="button"
                  disabled={isSubmittingApply}
                  onClick={handleSubmitApply}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingApply ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>신청 접수 및 텔레그램 알림 중...</span>
                    </>
                  ) : (
                    <>
                      <Gift className="w-4 h-4" />
                      <span>{requestedWins} Win 리워드 신청 완료</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. Page A: 리워드 지급 내역 페이지 */}
        {viewMode === 'history' && (
          <>
            {/* 리워드 신청 접수 성공 축하 배너 */}
            {applySuccessMsg && (
              <div className="p-3.5 mx-4 mt-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-2 text-xs text-emerald-300 animate-fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{applySuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setApplySuccessMsg('')}
                  className="text-emerald-400 hover:text-white font-bold p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 지급 요약 배너 및 관리자 추가 버튼 */}
            <div className="p-4 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
                    <span>
                      {selectedMember === 'all'
                        ? '전체 멤버 리워드 누적 지급액'
                        : `${selectedMember}님의 누적 리워드`}
                    </span>
                    {selectedMember !== 'all' && (
                      <>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          총 {userWins} Win
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold font-mono">
                          남은 신청 가능 리워드 WIN: {availableWins}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-300 font-mono">
                      {totalAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}{' '}
                      SOL
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
                    <span>
                      {editingRewardId ? '리워드 내역 수정' : '새 솔라나 리워드 지급 내역 등록'}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
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
                    <label className="block text-slate-300 font-bold mb-1">
                      지급 수량 (SOL) *
                    </label>
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
                    <label className="block text-slate-300 font-bold mb-1">지급 사유 / 제목</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="예: 11월 1주차 식사 배틀 우승 상금"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400"
                    />
                  </div>

                  {/* 트랜잭션 해시 */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-bold mb-1">
                      솔라나 트랜잭션 해시 (Signature) *
                    </label>
                    <input
                      type="text"
                      value={formTxHash}
                      onChange={(e) => setFormTxHash(e.target.value)}
                      placeholder="Solscan에서 확인할 수 있는 트랜잭션 시그네이처 입력"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400 font-mono text-[11px]"
                    />
                  </div>

                  {/* 수신자 지갑 */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      수신자 지갑 주소 (선택)
                    </label>
                    <input
                      type="text"
                      value={formRecipientWallet}
                      onChange={(e) => setFormRecipientWallet(e.target.value)}
                      placeholder="예: 7G8k... 또는 phantom 지갑"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400 font-mono text-[11px]"
                    />
                  </div>

                  {/* 지급 일자 */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">지급 일자 *</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400"
                    />
                  </div>

                  {/* 메모 */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-bold mb-1">
                      메모 / 비고 (선택)
                    </label>
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
                            <span>
                              + {reward.amount} {reward.unit || 'SOL'}
                            </span>
                          </div>
                          {reward.onChainSnapshot?.approxKrwValue && (
                            <div className="text-[10px] text-emerald-400/90 font-medium font-sans">
                              {reward.onChainSnapshot.approxKrwValue}
                            </div>
                          )}
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
                          <span
                            className="font-mono text-slate-300 text-[11px] truncate select-all"
                            title={reward.txHash}
                          >
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

                      {/* 온체인 영구 박제 영수증 영역 */}
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
                                  {isRefreshingSnapshot[reward.id]
                                    ? '동기화 중...'
                                    : '새로고침'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleSnapshot(reward.id)}
                                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline flex items-center gap-1"
                              >
                                {expandedSnapshots[reward.id]
                                  ? '영수증 접기 ▲'
                                  : '영수증 상세 보기 ▼'}
                              </button>
                            </div>
                          </div>

                          {/* 영수증 상세 패널 (펼쳤을 때) */}
                          {expandedSnapshots[reward.id] && (
                            <div className="pt-2 border-t border-slate-800/80 space-y-1.5 font-mono text-[11px] text-slate-300">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                <p>
                                  <span className="text-slate-400">승인 상태: </span>
                                  <span className="text-emerald-400 font-bold">
                                    ✅ {reward.onChainSnapshot.status} (Finalized)
                                  </span>
                                </p>
                                <p>
                                  <span className="text-slate-400">블록 슬롯: </span>
                                  <span className="text-amber-300">
                                    #{reward.onChainSnapshot.slot}
                                  </span>
                                </p>
                                {reward.onChainSnapshot.blockTimeFormatted && (
                                  <p className="sm:col-span-2">
                                    <span className="text-slate-400">블록 일시: </span>
                                    <span>{reward.onChainSnapshot.blockTimeFormatted}</span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.transferredSolFormatted && (
                                  <p>
                                    <span className="text-slate-400">실제 전송 수량: </span>
                                    <span className="text-cyan-300 font-bold">
                                      {reward.onChainSnapshot.transferredSolFormatted}
                                    </span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.approxKrwValue && (
                                  <p>
                                    <span className="text-slate-400">한화 환산 가치: </span>
                                    <span className="text-emerald-300 font-bold">
                                      {reward.onChainSnapshot.approxKrwValue}
                                    </span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.upbitSolPriceFormatted && (
                                  <p className="sm:col-span-2 text-[10px] text-slate-400">
                                    <span>업비트 전송 시점 SOL 시세: </span>
                                    <span className="text-slate-300">
                                      {reward.onChainSnapshot.upbitSolPriceFormatted}
                                    </span>
                                    {reward.onChainSnapshot.priceReferenceDate && (
                                      <span> ({reward.onChainSnapshot.priceReferenceDate})</span>
                                    )}
                                  </p>
                                )}
                                {reward.onChainSnapshot.sender && (
                                  <p className="sm:col-span-2 truncate">
                                    <span className="text-slate-400">발신 지갑: </span>
                                    <span className="text-slate-400 text-[10px]">
                                      {reward.onChainSnapshot.sender}
                                    </span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.recipient && (
                                  <p className="sm:col-span-2 truncate">
                                    <span className="text-slate-400">수신 지갑: </span>
                                    <span className="text-slate-400 text-[10px]">
                                      {reward.onChainSnapshot.recipient}
                                    </span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.fee && (
                                  <p>
                                    <span className="text-slate-400">네트워크 수수료: </span>
                                    <span className="text-slate-400">
                                      {reward.onChainSnapshot.fee}
                                    </span>
                                  </p>
                                )}
                                {reward.onChainSnapshot.capturedAtFormatted && (
                                  <p className="sm:col-span-2 text-[10px] text-slate-500">
                                    <span>스냅샷 박제 시각: </span>
                                    <span>{reward.onChainSnapshot.capturedAtFormatted}</span>
                                  </p>
                                )}
                              </div>

                              <div className="pt-1.5 text-[10px] text-slate-400 border-t border-slate-900 flex items-center gap-1 font-sans">
                                <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>
                                  블록체인에서 추출하여 MongoDB에 영구 박제된 데이터입니다. 향후
                                  Solscan에서 해당 트랜잭션이 만료(Truncate)되더라도 증빙 효력을
                                  유지합니다.
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
                              <span>
                                {isRefreshingSnapshot[reward.id]
                                  ? '스냅샷 추출 중...'
                                  : '온체인 스냅샷 박제'}
                              </span>
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
          </>
        )}

        {/* 모달 푸터 */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="hidden sm:inline">
              Solscan 링크를 누르면 온체인 전송 증빙을 실시간 확인할 수 있습니다.
            </span>
            <span className="sm:hidden">온체인 영수증 실시간 검증 지원</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* 닫기 버튼 왼쪽에 리워드 신청하기 버튼 배치 */}
            <button
              type="button"
              onClick={handleOpenApplyFlow}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-xs shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
              title="리워드 퀴즈 풀고 온체인 리워드 신청하기"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>리워드 신청하기</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {isImageZoomed && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
          onClick={() => setIsImageZoomed(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setIsImageZoomed(false)}
              className="absolute -top-10 right-0 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>닫기</span>
            </button>
            <img
              src="/reward.png"
              alt="리워드 안내 확대"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-slate-700 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
