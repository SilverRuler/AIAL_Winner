'use client';

import React, { useState } from 'react';
import { X, Bell, Sparkles, ShieldCheck, Info, Award, ChevronDown, ChevronUp, Gift, Gamepad2, Wallet, CameraOff, CalendarCheck, Dices } from 'lucide-react';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({ isOpen, onClose }) => {
  const [open261030, setOpen261030] = useState(false);
  const [open261101, setOpen261101] = useState(false);
  const [open261102, setOpen261102] = useState(false);
  const [open261122, setOpen261122] = useState(false);
  const [open261125, setOpen261125] = useState(false);
  const [open261126, setOpen261126] = useState(false);
  const [open261127, setOpen261127] = useState(false);
  const [open261128, setOpen261128] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-950/60 via-slate-900 to-slate-900 border-b border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>AIAL Winner 공지사항</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                식사 평가 AI 모델 업데이트 및 시스템 안내
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

        {/* 본문 안내 */}
        <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-200 max-h-[75vh] overflow-y-auto">
          {/* 261030 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-blue-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261030(!open261030)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                  📌 261030 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  평가 모델 교체 안내 (NVIDIA NIM 1T)
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-10-30</span>
                {open261030 ? (
                  <ChevronUp className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261030 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  평가의 신뢰성을 위해 당일 저녁부터 평가 모델을 교체하였습니다.
                </p>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p><span className="text-amber-400 font-bold">모델 이름 :</span> NVIDIA NIM Vision 모델 (mistralai/mistral-large-4-1t-a52b)</p>
                  <p><span className="text-amber-400 font-bold">모델 스펙 :</span> 1T(1조 파라미터) 초대형 모델 + CoT(생각의 사슬) 추론</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  이전의 게시글도 재심사 하였습니다(이전 게시글은 위너 변동X)
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  각 게시글마다 0점부터 100점까지 다채롭고 객관적인 평가 기준을 도입했습니다.
                </p>
              </div>
            )}
          </div>

          {/* 261101 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-indigo-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261101(!open261101)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  📌 261101 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  폴백 모델 및 리워드 지급현황 안내
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-01</span>
                {open261101 ? (
                  <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261101 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  출품한 작품은 4가지 폴백 모델에 의해 평가됩니다. <span className="text-[11px] font-normal text-cyan-400">(→ 261128 공지에서 5단계로 개편)</span>
                </p>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p><span className="text-indigo-400 font-bold">1.</span> mistralai/mistral-large-4-1t-a52b</p>
                  <p><span className="text-indigo-400 font-bold">2.</span> nvidia/nemotron-3.5-super-vl-120b-a12b</p>
                  <p><span className="text-indigo-400 font-bold">3.</span> nvidia/nemotron-3-nano-omni-30b-a3b-reasoning</p>
                  <p><span className="text-indigo-400 font-bold">4.</span> sr-combo</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  각 평가의 코멘트 끝에 평가 모델이 기재됩니다.
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  다른 모델이 평가해서 점수가 마음에 안들면 관리자에게 이의신청을 할 수 있습니다.
                </p>
                <p className="text-amber-300 text-xs sm:text-sm flex items-center gap-2 pt-1 border-t border-slate-800/80 font-bold">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  명예의 전당에서 리워드 지급현황을 확인할 수 있습니다
                </p>
              </div>
            )}
          </div>

          {/* 261102 공지 카드 (접은 형태 / 아코디언) */}
          <div className="bg-slate-950/80 rounded-xl border border-purple-500/30 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261102(!open261102)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                  📌 261102 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  리워드 시스템 구축
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-02</span>
                {open261102 ? (
                  <ChevronUp className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261102 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Gift className="w-4 h-4 text-purple-400 shrink-0" />
                  간단한 솔라나 문제를 풀고 관리자에게 리워드를 신청할 수 있습니다.
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  관리자를 제외하고 히든 멤버를 추가하였습니다.
                </p>
              </div>
            )}
          </div>

          {/* 261122 공지 카드 (UFO 가챠 구현) */}
          <div className="bg-slate-950/80 rounded-xl border border-cyan-500/40 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261122(!open261122)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                  📌 261122 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  UFO 가챠 구현
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-22</span>
                {open261122 ? (
                  <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261122 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-center gap-2 pt-2">
                  <Gamepad2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  승점에 관계 없이 식사를 올리면 매 5회 가챠권이 생깁니다.
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  12인 공유 3D UFO 크레인에서 Bar 사이로 상자를 통과시키면 0.01(약 1000원 가량) SOL 리워드를 신청할 수 있습니다.
                </p>
                <p className="text-amber-300 text-xs sm:text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  신뢰를 기반으로 운영중이며 타인의 닉을 사용하지 마시기 바랍니다.
                </p>
                <p className="text-purple-300 text-xs sm:text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                  승점 1WIN을 소모하여 +5 가챠권을 획득할 수 있습니다
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  베타서비스이므로 요청/요구 사항이 있으면 건의 하시길 바랍니다.
                </p>
              </div>
            )}
          </div>

          {/* 261125 공지 카드 (사내 MDM 등록, 운영자 잔고, 교환 정책 업데이트) */}
          <div className="bg-slate-950/80 rounded-xl border border-emerald-500/45 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261125(!open261125)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                  📌 261125 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  MDM 사진 미첨부 등록 · 운영자 잔고 · 정책 업데이트
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-25</span>
                {open261125 ? (
                  <ChevronUp className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261125 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-start gap-2 pt-2">
                  <CameraOff className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    사내 보안(MDM)으로 카메라 사용이 불가한 유저도 <strong className="text-emerald-300">사진 없이 메뉴 이름(제목)과 상세 설명</strong>만으로 식사를 등록할 수 있습니다.
                  </span>
                </p>
                <div className="ml-6 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p>• 등록 필수 조건: <strong className="text-white">사진 또는 메뉴 이름(제목) 중 1개 필수</strong> (기존처럼 사진만 올려도 등록 가능)</p>
                  <p>• 사진 미첨부 시 기본 이미지가 적용되며, 설명을 자세히 적을수록 <strong className="text-amber-300">최대 50점 한도</strong> 내에서 AI가 최대한 평가합니다.</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-start gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    상단 헤더에 <strong className="text-emerald-300">[운영자 잔고]</strong> 버튼을 추가했습니다. 1시간마다 갱신되는 운영자 SOL 잔고와 실시간 시세(0.01 SOL 원화 환산가)를 확인할 수 있으며, 리워드는 <strong className="text-amber-300">신청 기준 선착순</strong>으로 지급됩니다.
                  </span>
                </p>
                <p className="text-amber-300 text-xs sm:text-sm flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    승점 1WIN → 뽑기권 5회 교환은 <strong className="text-white">보유 중인 신청 가능 리워드 WIN(1WIN 이상)</strong>에 대해서만 가능하도록 마이너스 가불을 차단했으며, 식사 삭제 후 재등록 시 뽑기권 중복 지급도 방지됩니다.
                  </span>
                </p>
                <p className="text-cyan-300 text-xs sm:text-sm flex items-start gap-2">
                  <Gamepad2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    UFO 뽑기의 상자별 난이도·리워드 개편, 까치발 시점 조작, SOL 직접 입력 리워드 신청 등 상세 변경 사항은 뽑기 페이지의 <strong>[UFO 공지]</strong>에서 확인하실 수 있습니다.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* 261126 공지 카드 (출석보상, 눈치 미니게임, 운영자 예상 잔고, 헤더 스크롤) */}
          <div className="bg-slate-950/85 rounded-xl border border-fuchsia-500/45 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261126(!open261126)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 shrink-0">
                  📌 261126 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  출석보상 · 눈치 미니게임 오픈 · UI/보안 대규모 업데이트
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-26</span>
                {open261126 ? (
                  <ChevronUp className="w-4 h-4 text-fuchsia-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261126 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-start gap-2 pt-2">
                  <CalendarCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    상단 헤더에 <strong className="text-amber-300">[출석보상]</strong> (모바일: <strong>출석</strong>) 버튼이 추가되었습니다! 매일 <strong className="text-white">오전 08:00~10:00 · 저녁 18:00~20:00 (KST)</strong>에 접속해 본인 닉네임을 누르면 <strong className="text-amber-300">뽑기권 +3장</strong>이 즉시 지급됩니다.
                  </span>
                </p>
                <p className="text-slate-200 text-xs sm:text-sm flex items-start gap-2">
                  <Dices className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
                  <span>
                    실시간 동시접속 <strong className="text-fuchsia-300">[미니게임] (1~9 눈치게임)</strong>이 새롭게 오픈했습니다!
                  </span>
                </p>
                <div className="ml-6 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p>• <strong className="text-white">정규 시간:</strong> 매일 <strong className="text-fuchsia-300">14:00 ~ 14:03 (KST)</strong> 입장 대기 → 14:03 정각 입장 마감 (게릴라 오픈 가능)</p>
                  <p>• <strong className="text-white">규칙:</strong> 30초 내 1~9 중 중복되지 않는 <strong className="text-amber-300">가장 낮은 숫자</strong>를 고른 단독 1명 우승 → <strong className="text-emerald-300">뽑기권 +5장</strong> 지급</p>
                  <p>• <strong className="text-white">서든데스 & 이탈:</strong> 전원 중복 시 30초 서든데스 재경기(최대 3회), 14:03 마감 후 새로고침·화면 이탈 시 즉시 탈락(OUT), 1닉네임·1IP 중복 참여 차단</p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-start gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-emerald-300">[운영자 잔고]</strong> 모달에 미신청·미지급 리워드(식사 WIN + UFO 뽑기)를 차감한 <strong className="text-white">예상 잔여 잔고</strong> 표시가 추가되었습니다.
                  </span>
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    모바일·데스크톱 헤더 액션바 가로 스크롤을 개선했습니다. 기본 위치는 우측 끝(식사 등록)이며, 모바일 스와이프·데스크톱 마우스 휠 및 좌/우 화살표로 모든 메뉴를 편하게 이용할 수 있습니다.
                  </span>
                </p>
                <p className="text-cyan-300 text-xs sm:text-sm flex items-start gap-2">
                  <Gamepad2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    UFO 뽑기판 13종 확장(신규 3D 인형 4종 포함)·실시간 관전(LIVE)·뽑기정보 스펙표는 뽑기 페이지의 <strong>[UFO 공지]</strong>와 <strong>[뽑기정보]</strong>에서 확인하실 수 있습니다.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* 261127 공지 카드 (미니게임 개편, 출석시간, 단축키, 보안, UFO 대개편) */}
          <div className="bg-slate-950/90 rounded-xl border border-amber-500/50 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261127(!open261127)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  📌 261127 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  미니게임 가위바위보·BGM · 단축키 · 보안 · UFO 대개편
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-27</span>
                {open261127 ? (
                  <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261127 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-start gap-2 pt-2">
                  <Dices className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-fuchsia-300">[미니게임]</strong> 인원수별 게임 규칙이 공정하게 개편되고, 사운드 연출이 추가되었습니다!
                  </span>
                </p>
                <div className="ml-6 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300">
                  <p>• <strong className="text-emerald-300">1명 참여:</strong> 별도 게임 없이 <strong className="text-white">자동 우승</strong> (뽑기권 +5장 즉시 지급)</p>
                  <p>• <strong className="text-amber-300">2명 참여:</strong> <strong className="text-white">가위바위보(✌️/✊/✋)</strong> 1:1 대결로 자동 전환! 비길 경우 최대 3회 데스매치 진행 (3회 모두 비기면 승자 없음)</p>
                  <p>• <strong className="text-cyan-300">3명 이상:</strong> 기존과 동일하게 <strong className="text-white">1~9 최저 단독 숫자 눈치게임</strong> 진행</p>
                  <p>• <strong className="text-fuchsia-300">사운드:</strong> 인원 마감 5초 카운트다운 음성 및 게임 진행 중 전용 BGM 재생</p>
                </div>
                <p className="text-slate-200 text-xs sm:text-sm flex items-start gap-2">
                  <CalendarCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-amber-300">[출석보상]</strong> 시간이 매일 <strong className="text-white">오전 08:00~10:00 (1회) · 저녁 18:00~20:00 (1회) (KST)</strong>으로 개편되었습니다. 각 시간대별 1회씩 뽑기권 +3장을 수령할 수 있습니다.
                  </span>
                </p>
                <p className="text-slate-300 text-xs sm:text-sm flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    식사배틀·뽑기·미니게임의 모든 확인·안내·입력 팝업에서 <strong className="text-white">Enter(확인) / Esc(취소)</strong> 키보드 단축키를 지원합니다.
                  </span>
                </p>
                <p className="text-emerald-300 text-xs sm:text-sm flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    서비스 보안을 위해 <strong className="text-white">한국(KR) 및 Google 공식 IP 대역</strong> 외 해외 비정상 접속을 차단하는 Geo-Block 보안 정책이 적용되었습니다.
                  </span>
                </p>
                <p className="text-cyan-300 text-xs sm:text-sm flex items-start gap-2">
                  <Gamepad2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">UFO 뽑기 대개편:</strong> 3D 인형 5종 클래식 산더미 인형뽑기(36개 산더미 · 4방향 집게) 전환, 13종 뽑기판별 고유 물리·크레인·Bar 세팅, 뽑기판별 최근 로그 분리, [선택]/[랜덤] 이동, PC 확대 집중 모드 등 상세 변경 사항은 뽑기 페이지의 <strong>[UFO 공지]</strong>에서 확인하세요!
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* 261128 공지 카드 (AI 평가 폴백 모델 5단계 개편 & 본인 게시글 수정·삭제) */}
          <div className="bg-slate-950/90 rounded-xl border border-cyan-500/50 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setOpen261128(!open261128)}
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                  📌 261128 공지
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  AI 평가 폴백 모델 5단계 개편 · 본인 게시글 수정/삭제
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[11px] text-slate-400 hidden xs:inline">2026-11-28</span>
                {open261128 ? (
                  <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {open261128 && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-800/80 text-slate-200 leading-relaxed font-medium">
                <p className="text-sm sm:text-base font-bold text-white flex items-start gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    사진 미인식(텍스트 폴백) 발생을 최소화하기 위해 초고속 비전 모델(<strong className="text-cyan-300">nemotron-3.5-bolt-e4b</strong>)을 추가하여 <strong className="text-amber-300">5단계 폴백 체인</strong>으로 개편했습니다.
                  </span>
                </p>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[11px] sm:text-xs text-slate-300 font-mono">
                  <p><span className="text-cyan-400 font-bold">1.</span> mistralai/mistral-large-4-1t-a52b <span className="text-slate-500 font-sans">(메인 비전)</span></p>
                  <p><span className="text-cyan-400 font-bold">2.</span> nvidia/nemotron-3.5-super-vl-120b-a12b <span className="text-slate-500 font-sans">(고성능 비전)</span></p>
                  <p><span className="text-emerald-400 font-bold">3.</span> <span className="text-emerald-300 font-bold">nvidia/nemotron-3.5-bolt-e4b</span> <span className="text-emerald-400/90 font-sans">(신규 · 초고속 비전)</span></p>
                  <p><span className="text-cyan-400 font-bold">4.</span> nvidia/nemotron-3-nano-omni-30b-a3b-reasoning <span className="text-slate-500 font-sans">(예비 비전)</span></p>
                  <p><span className="text-slate-400 font-bold">5.</span> sr-combo <span className="text-slate-500 font-sans">(최후 텍스트 폴백)</span></p>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    각 평가 코멘트 끝에 실제 사용된 평가 모델명이 표시되며, 상단 <strong>모델 응답 상황</strong> 바에서 1~4순위 비전 모델의 상태를 확인할 수 있습니다.
                  </span>
                </p>
                <p className="text-emerald-300 text-xs sm:text-sm flex items-start gap-2 pt-1 border-t border-slate-800/80">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">본인 게시글 수정·삭제 지원:</strong> 이제 관리자 로그인 없이도 본인이 작성한 기기(쿠키·IP·브라우저 인증)에서 <strong className="text-emerald-200">내 글</strong>의 메뉴명·코멘트를 직접 수정하거나 삭제할 수 있습니다.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* 추가 안내 박스 (신규 AI 비전 모델 적용 안내 - 그대로 유지) */}
          <div className="flex items-start space-x-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm">신규 AI 비전 모델 적용 안내</h4>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                출품된 식사 사진을 실제 시각적으로 직접 판독(국물 색, 재료 상태, 플레이팅 등)하여 보다 공정하고 엄격한 미식 평가 점수를 부여합니다(각 사진당 평가 평균 <span className="text-red-400 font-bold">4~5분</span> 이상 소요). 비식사 사진(셀카 등)은 자동으로 최하점 처리됩니다.
              </p>
            </div>
          </div>

          {/* 닫기 버튼 */}
          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
