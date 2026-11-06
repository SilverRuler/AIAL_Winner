'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  HelpCircle,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';
import { QuizQuestion, REWARD_QUIZ_POOL } from '@/constants/quizzes';

interface AdminQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuizzesUpdated?: () => void;
}

export const AdminQuizModal: React.FC<AdminQuizModalProps> = ({
  isOpen,
  onClose,
  onQuizzesUpdated,
}) => {
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  // 수정 중인 퀴즈 ID (null이면 신규 등록 모드)
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  // 폼 상태
  const [quizType, setQuizType] = useState<'objective' | 'subjective'>('objective');
  const [questionText, setQuestionText] = useState('');
  const [subjectiveAnswer, setSubjectiveAnswer] = useState('');
  // 객관식 보기 (최소 2개 ~ 최대 4개)
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 퀴즈 목록 불러오기
  const fetchQuizzes = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/quizzes');
      const data = await res.json();
      if (data.success && Array.isArray(data.quizzes)) {
        setQuizzes(data.quizzes);
      } else {
        setQuizzes(REWARD_QUIZ_POOL);
      }
    } catch (e: any) {
      setErrorMsg('퀴즈 목록을 불러오는 중 오류가 발생했습니다.');
      setQuizzes(REWARD_QUIZ_POOL);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuizzes();
      setIsFormOpen(false);
      setErrorMsg('');
      setSuccessMsg('');
      resetForm();
    }
  }, [isOpen]);

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

  const resetForm = () => {
    setEditingQuizId(null);
    setQuestionText('');
    setSubjectiveAnswer('');
    setOptions(['', '', '', '']);
    setCorrectOption(1);
    setQuizType('objective');
    setErrorMsg('');
  };

  // 수정 모드 진입
  const handleStartEditQuiz = (quiz: QuizQuestion) => {
    setEditingQuizId(quiz.id);
    setQuestionText(quiz.question);
    setQuizType(quiz.type);

    if (quiz.type === 'subjective') {
      setSubjectiveAnswer(quiz.answer || (quiz.id === 'upbit_sol_min' ? '0.01' : ''));
      setOptions(['', '', '', '']);
      setCorrectOption(1);
    } else {
      const quizOpts =
        quiz.options && quiz.options.length >= 2
          ? quiz.options.map((o) => o.text)
          : ['', '', '', ''];
      setOptions(quizOpts);
      setCorrectOption(quiz.correctOption || 1);
      setSubjectiveAnswer('');
    }

    setIsFormOpen(true);
    setErrorMsg('');
    setSuccessMsg('');

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  // 퀴즈 등록 / 수정 제출
  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedQ = questionText.trim();
    if (!trimmedQ) {
      setErrorMsg('Q. 문제를 입력해주세요.');
      return;
    }

    let payload: any = {
      question: trimmedQ,
      type: quizType,
      showGuideImage: true,
    };

    if (quizType === 'subjective') {
      const trimmedAns = subjectiveAnswer.trim();
      if (!trimmedAns) {
        setErrorMsg('A. 주관식 정답을 입력해주세요.');
        return;
      }
      payload.answer = trimmedAns;
      payload.placeholder = '정답 입력';
    } else {
      if (options.length < 2 || options.length > 4) {
        setErrorMsg('객관식은 최소 2개에서 최대 4개의 보기를 입력해야 합니다.');
        return;
      }

      for (let i = 0; i < options.length; i++) {
        if (!options[i] || !options[i].trim()) {
          setErrorMsg(`보기 ${i + 1}번 내용을 입력해주세요.`);
          return;
        }
      }

      if (correctOption < 1 || correctOption > options.length) {
        setErrorMsg('정답으로 지정할 보기를 체크해주세요.');
        return;
      }

      payload.options = options.map((text, idx) => ({
        no: idx + 1,
        text: text.trim(),
      }));
      payload.correctOption = correctOption;
    }

    const adminId = sessionStorage.getItem('aial_admin_id') || 'aaa';
    const adminPw = sessionStorage.getItem('aial_admin_pw') || 'bbb';

    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingQuizId);
      const url = '/api/quizzes';
      const method = isEditing ? 'PATCH' : 'POST';
      const bodyData = isEditing
        ? { id: editingQuizId, ...payload, adminId, adminPw }
        : { ...payload, adminId, adminPw };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(
          isEditing
            ? '퀴즈가 성공적으로 수정되었습니다!'
            : '신규 퀴즈가 성공적으로 등록되었습니다!'
        );
        resetForm();
        setIsFormOpen(false);
        await fetchQuizzes();
        if (onQuizzesUpdated) onQuizzesUpdated();
      } else {
        setErrorMsg(data.message || (isEditing ? '퀴즈 수정에 실패했습니다.' : '퀴즈 등록에 실패했습니다.'));
      }
    } catch (err: any) {
      setErrorMsg('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 퀴즈 삭제
  const handleDeleteQuiz = async (id: string, qText: string) => {
    if (!confirm(`정말 이 퀴즈를 삭제하시겠습니까?\n\n"${qText.substring(0, 30)}..."`)) {
      return;
    }

    const adminId = sessionStorage.getItem('aial_admin_id') || 'aaa';
    const adminPw = sessionStorage.getItem('aial_admin_pw') || 'bbb';

    setDeletingId(id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/quizzes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-id': adminId,
          'x-admin-pw': adminPw,
        },
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg('퀴즈가 성공적으로 삭제되었습니다.');
        if (editingQuizId === id) {
          resetForm();
          setIsFormOpen(false);
        }
        await fetchQuizzes();
        if (onQuizzesUpdated) onQuizzesUpdated();
      } else {
        setErrorMsg(data.message || '퀴즈 삭제에 실패했습니다.');
      }
    } catch (err: any) {
      setErrorMsg('삭제 요청 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-purple-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border-b border-purple-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-lg shadow-purple-900/30">
              <HelpCircle className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">온체인 퀴즈 관리</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  관리자 전용
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                솔라나 리워드 신청 시 무작위 2문제로 출제되는 온체인 퀴즈를 관리합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 안내 및 액션 배너 */}
        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">
              총 <span className="text-purple-400 font-mono font-black">{quizzes.length}</span>개 퀴즈 등록됨
            </span>
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              (매 신청마다 편향 없이 2문제 균등 무작위 배정)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isFormOpen) {
                setIsFormOpen(false);
                resetForm();
              } else {
                resetForm();
                setIsFormOpen(true);
              }
              if (errorMsg) setErrorMsg('');
            }}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
              isFormOpen
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border border-purple-400/50 hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/30'
            }`}
          >
            {isFormOpen ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>{editingQuizId ? '수정 취소' : '폼 닫기'}</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>퀴즈 추가</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* 성공 / 오류 메시지 배너 */}
        {successMsg && (
          <div className="p-3 mx-4 mt-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-emerald-400 hover:text-white font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 mx-4 mt-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-rose-400 hover:text-white font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 퀴즈 추가/수정 폼 카드 */}
          {isFormOpen && (
            <form
              ref={formRef}
              onSubmit={handleSubmitQuiz}
              className={`p-4 sm:p-5 rounded-2xl bg-slate-950 border space-y-4 shadow-xl animate-fade-in ${
                editingQuizId ? 'border-amber-500/50' : 'border-purple-500/40'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  {editingQuizId ? (
                    <>
                      <Pencil className="w-4 h-4 text-amber-400" />
                      <span>온체인 퀴즈 수정</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-purple-400" />
                      <span>새로운 온체인 퀴즈 등록</span>
                    </>
                  )}
                </h3>

                {/* 객관식 / 주관식 선택 토글 */}
                <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setQuizType('objective')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      quizType === 'objective'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    객관식 (2~4지선다)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuizType('subjective')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      quizType === 'subjective'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    주관식
                  </button>
                </div>
              </div>

              {/* Q. 문제 입력 필드 */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300">
                  Q. 문제를 입력하시오 <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder={
                    quizType === 'objective'
                      ? '예: 솔라나는 체인 출시 이후, 네트워크가 한 번이라도 중단된 적이 있다.'
                      : '예: 업비트에서 요구하는 SOL 최소 입금 금액은 몇인가?'
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-400 resize-none"
                />
              </div>

              {/* 주관식 입력 폼: A. 답 */}
              {quizType === 'subjective' ? (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-300">
                    A. 답 (정답 문자열) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={subjectiveAnswer}
                    onChange={(e) => setSubjectiveAnswer(e.target.value)}
                    placeholder="예: 0.01 또는 역사증명"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">
                    ※ 유저가 입력할 때 공백, 대소문자, 접미어(SOL, 개)는 자동으로 유연하게 처리됩니다.
                  </p>
                </div>
              ) : (
                /* 객관식 2~4지선다 입력 폼: 보기 개수 선택 및 체크박스(정답 선택) */
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="block text-xs font-bold text-slate-300">
                      보기 입력 및 정답 선택 <span className="text-rose-400">*</span>
                    </label>

                    {/* 보기 개수 선택 버튼 (최소 2개 ~ 최대 4개) */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[11px] text-slate-400">보기 개수:</span>
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            setOptions((prev) => {
                              const next = [...prev];
                              while (next.length < count) next.push('');
                              return next.slice(0, count);
                            });
                            if (correctOption > count) setCorrectOption(1);
                          }}
                          className={`px-2 py-0.5 rounded-lg font-bold text-[11px] border transition-all cursor-pointer ${
                            options.length === count
                              ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {count}개 {count === 2 ? '(O/X)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 보기 리스트 */}
                  <div className="space-y-2">
                    {options.map((optVal, idx) => {
                      const optNo = idx + 1;
                      const isCorrect = correctOption === optNo;
                      return (
                        <div
                          key={optNo}
                          className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                            isCorrect
                              ? 'bg-purple-950/30 border-purple-500/60 ring-1 ring-purple-400/40'
                              : 'bg-slate-900/80 border-slate-800'
                          }`}
                        >
                          <span className="text-xs font-black text-slate-400 w-6 text-center font-mono">
                            {optNo})
                          </span>
                          <input
                            type="text"
                            required
                            value={optVal}
                            onChange={(e) => {
                              const next = [...options];
                              next[idx] = e.target.value;
                              setOptions(next);
                            }}
                            placeholder={`보기 ${optNo} 내용 입력 (예: ${
                              options.length === 2
                                ? optNo === 1
                                  ? 'YES'
                                  : 'NO'
                                : `보기 ${optNo}`
                            })`}
                            className="flex-1 bg-transparent border-0 text-xs text-white placeholder-slate-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setCorrectOption(optNo)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-sm'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
                            }`}
                          >
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                isCorrect
                                  ? 'bg-slate-950 border-slate-950 text-emerald-400'
                                  : 'border-slate-600 bg-slate-900'
                              }`}
                            >
                              {isCorrect && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span>{isCorrect ? '정답 선택됨' : '정답으로 지정'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-purple-300/80 pt-0.5">
                    ※ 정답인 보기 옆의 <strong>[정답으로 지정]</strong> 버튼을 클릭하여 체크박스를 활성화하세요.
                  </p>
                </div>
              )}

              {/* 가이드 이미지 안내 */}
              <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20 text-[11px] text-purple-300 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 shrink-0 text-purple-400" />
                <span>
                  모든 온체인 퀴즈 상단에는 솔라나 리워드 가이드 이미지(<code>/reward.png</code>)가 자동으로 표출됩니다.
                </span>
              </div>

              {/* 저장 / 취소 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    resetForm();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-xl text-white font-black text-xs shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    editingQuizId
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/30'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/30'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{editingQuizId ? '수정 저장 중...' : '등록 중...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingQuizId ? '수정 완료' : '퀴즈 등록 완료'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* 현재 작성된 퀴즈 목록 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 flex items-center justify-between">
              <span>현재 등록된 문제 목록 ({quizzes.length}개)</span>
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />}
            </h3>

            {quizzes.length === 0 && !isLoading && (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800">
                등록된 퀴즈가 없습니다. 상단의 [퀴즈 추가] 버튼을 눌러 문제를 등록해보세요!
              </div>
            )}

            <div className="space-y-2.5">
              {quizzes.map((quiz, index) => {
                const isDeleting = deletingId === quiz.id;
                const isEditing = editingQuizId === quiz.id;
                return (
                  <div
                    key={quiz.id}
                    className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border transition-all space-y-2.5 shadow-sm ${
                      isEditing
                        ? 'border-amber-500/60 ring-1 ring-amber-500/30'
                        : 'border-slate-800 hover:border-purple-500/30'
                    }`}
                  >
                    {/* 상단: 문제 번호, 유형 배지, 수정/삭제 버튼 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-black text-amber-400">
                          #{index + 1}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                            quiz.type === 'objective'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {quiz.type === 'objective'
                            ? `객관식 (${quiz.options?.length || 4}지선다)`
                            : '주관식'}
                        </span>
                        {quiz.isCustom ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                            관리자 추가
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                            기본 문제
                          </span>
                        )}
                        {isEditing && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold animate-pulse">
                            수정 중
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {/* 휴지통 왼쪽에 수정 버튼 */}
                        <button
                          type="button"
                          onClick={() => handleStartEditQuiz(quiz)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isEditing
                              ? 'text-amber-400 bg-amber-500/20 ring-1 ring-amber-400/40'
                              : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title="이 퀴즈 수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteQuiz(quiz.id, quiz.question)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                          title="이 퀴즈 삭제"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 문제 내용 */}
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                        Q. {quiz.question}
                      </h4>
                    </div>

                    {/* 주관식 정답 표기 */}
                    {quiz.type === 'subjective' && (
                      <div className="p-2 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-300 flex items-center gap-2 font-mono">
                        <span className="font-bold text-cyan-400">A. 정답:</span>
                        <span>{quiz.answer || (quiz.id === 'upbit_sol_min' ? '0.01' : '미기록')}</span>
                      </div>
                    )}

                    {/* 객관식 보기 표기 (2~4개 동적 표기) */}
                    {quiz.type === 'objective' && Array.isArray(quiz.options) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {quiz.options.map((opt) => {
                          const isAnswer = opt.no === quiz.correctOption;
                          return (
                            <div
                              key={opt.no}
                              className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between border ${
                                isAnswer
                                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 font-bold'
                                  : 'bg-slate-900 border-slate-800/80 text-slate-400'
                              }`}
                            >
                              <span>
                                {opt.no}) {opt.text}
                              </span>
                              {isAnswer && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-black">
                                  ✓ 정답
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 모달 하단 닫기 바 */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
