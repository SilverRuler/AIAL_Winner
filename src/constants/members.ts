import { Member, MealSlot } from '@/types/meal';

/**
 * AIAL 12인의 멤버 목록 (단일 선택용)
 */
export const MEMBERS: Member[] = [
  { id: 'gye', name: '계', avatarBg: 'bg-emerald-500/20 text-emerald-400', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/40' },
  { id: 'sunbin', name: '썬빈', avatarBg: 'bg-amber-500/20 text-amber-400', textColor: 'text-amber-400', borderColor: 'border-amber-500/40' },
  { id: 'myamizhang', name: '먀미장 킴', avatarBg: 'bg-rose-500/20 text-rose-400', textColor: 'text-rose-400', borderColor: 'border-rose-500/40' },
  { id: 'gangmaeng', name: '강맹', avatarBg: 'bg-blue-500/20 text-blue-400', textColor: 'text-blue-400', borderColor: 'border-blue-500/40' },
  { id: 'eomeong', name: '엄엉', avatarBg: 'bg-purple-500/20 text-purple-400', textColor: 'text-purple-400', borderColor: 'border-purple-500/40' },
  { id: 'zaragwan', name: '자라관', avatarBg: 'bg-teal-500/20 text-teal-400', textColor: 'text-teal-400', borderColor: 'border-teal-500/40' },
  { id: 'balbal', name: '발발', avatarBg: 'bg-orange-500/20 text-orange-400', textColor: 'text-orange-400', borderColor: 'border-orange-500/40' },
  { id: 'jaejjol', name: '재쫄', avatarBg: 'bg-cyan-500/20 text-cyan-400', textColor: 'text-cyan-400', borderColor: 'border-cyan-500/40' },
  { id: 'iricorp', name: '주식회사이리', avatarBg: 'bg-indigo-500/20 text-indigo-400', textColor: 'text-indigo-400', borderColor: 'border-indigo-500/40' },
  { id: 'samsungkim', name: '삼성킴', avatarBg: 'bg-sky-500/20 text-sky-400', textColor: 'text-sky-400', borderColor: 'border-sky-500/40' },
  { id: 'munth', name: '문탷', avatarBg: 'bg-fuchsia-500/20 text-fuchsia-400', textColor: 'text-fuchsia-400', borderColor: 'border-fuchsia-500/40' },
  { id: 'silver', name: '실버', avatarBg: 'bg-slate-300/20 text-slate-200', textColor: 'text-slate-200', borderColor: 'border-slate-400/40' },
];

export const MEAL_SLOTS: {
  slot: MealSlot;
  label: string;
  iconName: string;
  timeRange: string;
  color: string;
  activeColor: string;
}[] = [
  {
    slot: '아침',
    label: '🌅 아침 (Breakfast)',
    iconName: 'Sunrise',
    timeRange: '05:00 ~ 10:00',
    color: 'from-amber-500/20 to-orange-500/10 text-amber-300 border-amber-500/30',
    activeColor: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/25',
  },
  {
    slot: '점심',
    label: '☀️ 점심 (Lunch)',
    iconName: 'Sun',
    timeRange: '11:00 ~ 13:30',
    color: 'from-sky-500/20 to-blue-500/10 text-sky-300 border-sky-500/30',
    activeColor: 'bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-sky-500/25',
  },
  {
    slot: '저녁',
    label: '🌙 저녁 (Dinner)',
    iconName: 'Moon',
    timeRange: '17:00 ~ 22:00',
    color: 'from-purple-500/20 to-pink-500/10 text-purple-300 border-purple-500/30',
    activeColor: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-purple-500/25',
  },
];

/**
 * 한국 표준시(KST, UTC+9) 기준 현재 시각 정보 계산
 * Intl.DateTimeFormat을 사용하여 기기의 타임존 설정과 무관하게 정확한 한국 표준시(KST) 산출
 */
export function getKSTNow() {
  const now = new Date();
  
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = parseInt(getPart('hour'), 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(getPart('minute'), 10);

    const date = `${year}-${month}-${day}`;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const totalMins = hour * 60 + minute;

    // 비는 타임대 (휴식 시간대):
    // 1) 야간 휴식: 22:00 ~ 05:00 (1320분 이상 또는 300분 미만)
    // 2) 아침 종료 후 휴식: 10:00 ~ 11:00 (600분 이상 660분 미만)
    // 3) 점심 종료 후 휴식: 13:30 ~ 17:00 (810분 이상 1020분 미만)
    const isNightBreak = totalMins >= 1320 || totalMins < 300;
    const isMorningLunchBreak = totalMins >= 600 && totalMins < 660;
    const isLunchDinnerBreak = totalMins >= 810 && totalMins < 1020;
    const isIdleTime = isNightBreak || isMorningLunchBreak || isLunchDinnerBreak;

    let idleReason = '';
    if (isNightBreak) {
      idleReason = '식사 배틀 야간 휴식 시간 (22:00 ~ 05:00)';
    } else if (isMorningLunchBreak) {
      idleReason = '식사 배틀 휴식 시간 (10:00 ~ 11:00)';
    } else if (isLunchDinnerBreak) {
      idleReason = '식사 배틀 휴식 시간 (13:30 ~ 17:00)';
    }

    let activeSlot: MealSlot | null = null;
    if (totalMins >= 300 && totalMins < 600) {
      activeSlot = '아침'; // 05:00 ~ 10:00
    } else if (totalMins >= 660 && totalMins < 810) {
      activeSlot = '점심'; // 11:00 ~ 13:30
    } else if (totalMins >= 1020 && totalMins < 1320) {
      activeSlot = '저녁'; // 17:00 ~ 22:00
    }

    return { date, time, hour, minute, totalMins, isIdleTime, idleReason, activeSlot };
  } catch (e) {
    // Fallback
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const kst = new Date(utc + 9 * 3600000);
    const year = kst.getFullYear();
    const month = String(kst.getMonth() + 1).padStart(2, '0');
    const day = String(kst.getDate()).padStart(2, '0');
    const hour = kst.getHours();
    const minute = kst.getMinutes();
    const date = `${year}-${month}-${day}`;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const totalMins = hour * 60 + minute;
    
    const isNightBreak = totalMins >= 1320 || totalMins < 300;
    const isMorningLunchBreak = totalMins >= 600 && totalMins < 660;
    const isLunchDinnerBreak = totalMins >= 810 && totalMins < 1020;
    const isIdleTime = isNightBreak || isMorningLunchBreak || isLunchDinnerBreak;

    let idleReason = '';
    if (isNightBreak) {
      idleReason = '식사 배틀 야간 휴식 시간 (22:00 ~ 05:00)';
    } else if (isMorningLunchBreak) {
      idleReason = '식사 배틀 휴식 시간 (10:00 ~ 11:00)';
    } else if (isLunchDinnerBreak) {
      idleReason = '식사 배틀 휴식 시간 (13:30 ~ 17:00)';
    }

    let activeSlot: MealSlot | null = null;
    if (totalMins >= 300 && totalMins < 600) activeSlot = '아침';
    else if (totalMins >= 660 && totalMins < 810) activeSlot = '점심';
    else if (totalMins >= 1020 && totalMins < 1320) activeSlot = '저녁';

    return { date, time, hour, minute, totalMins, isIdleTime, idleReason, activeSlot };
  }
}

/**
 * 현재 시간에 맞는 기본 식사 타임대를 자동 판별
 * - 오전 00시 00분부터 11:00까지는 아침 탭 (자정 넘어가면 자동으로 아침 탭, 10:00 평가 후 점심 시작 전까지 아침 결과 확인)
 * - 11:00부터 17:00까지는 점심 탭 (점심시간에는 점심 탭, 13:30 평가 후 저녁 시작 전까지 점심 결과 확인)
 * - 17:00부터 23:59까지는 저녁 탭 (저녁 11:59까지는 저녁 탭, 22:00 평가 후 저녁 결과 확인)
 */
export function getCurrentMealSlot(): MealSlot {
  const { totalMins } = getKSTNow();
  if (totalMins < 660) {
    return '아침'; // 00:00 ~ 10:59
  }
  if (totalMins < 1020) {
    return '점심'; // 11:00 ~ 16:59
  }
  return '저녁'; // 17:00 ~ 23:59
}

/**
 * 한국 현재 시각(KST)을 기준으로 특정 날짜/타임대에 글을 올릴 수 있는지 엄격 검증
 * 1) 비는 시간대 (10:00~11:00, 13:30~17:00, 22:00~05:00) 등록 불가
 * 2) 지난 날짜 등록 불가
 * 3) 오늘 기준 이미 종료된 지난 타임대 등록 불가
 * 4) 아직 시작되지 않은 미래 타임대 등록 불가
 */
export function checkCanRegisterMeal(targetDate: string, targetSlot: MealSlot): {
  canRegister: boolean;
  reason?: string;
} {
  const { date: todayKST, totalMins } = getKSTNow();

  // 1. 시간이 비는 타임대 (휴식 시간) 차단
  if (totalMins >= 1320 || totalMins < 300) {
    return {
      canRegister: false,
      reason: '현재는 식사 배틀 야간 휴식 시간(22:00 ~ 05:00)입니다. 다음 아침 타임(05:00~)에 등록해주세요.',
    };
  }

  if (totalMins >= 600 && totalMins < 660) {
    return {
      canRegister: false,
      reason: '현재는 식사 배틀 휴식 시간(10:00 ~ 11:00)입니다. 다음 점심 타임(11:00~)에 등록해주세요.',
    };
  }

  if (totalMins >= 810 && totalMins < 1020) {
    return {
      canRegister: false,
      reason: '현재는 식사 배틀 휴식 시간(13:30 ~ 17:00)입니다. 다음 저녁 타임(17:00~)에 등록해주세요.',
    };
  }

  // 2. 과거/미래 날짜 차단
  if (targetDate < todayKST) {
    return {
      canRegister: false,
      reason: `지난 날짜(${targetDate})의 식사 배틀에는 사진을 등록할 수 없습니다.`,
    };
  }

  if (targetDate > todayKST) {
    return {
      canRegister: false,
      reason: `미래 날짜(${targetDate})에는 미리 식사를 등록할 수 없습니다.`,
    };
  }

  // 3. 오늘(todayKST) 기준 타임대(slot) 검증
  // 아침: 05:00 ~ 10:00 (종료 10:00 = 600분)
  if (targetSlot === '아침') {
    if (totalMins >= 600) {
      return {
        canRegister: false,
        reason: '아침 식사 배틀(05:00 ~ 10:00)은 이미 종료되어 더 이상 등록할 수 없습니다.',
      };
    }
    if (totalMins < 300) {
      return {
        canRegister: false,
        reason: '아침 식사 배틀은 05:00부터 등록 가능합니다.',
      };
    }
  }

  // 점심: 11:00 ~ 13:30 (종료 13:30 = 810분)
  if (targetSlot === '점심') {
    if (totalMins >= 810) {
      return {
        canRegister: false,
        reason: '점심 식사 배틀(11:00 ~ 13:30)은 이미 종료되어 더 이상 등록할 수 없습니다.',
      };
    }
    if (totalMins < 660) {
      return {
        canRegister: false,
        reason: '점심 식사 배틀은 11:00부터 등록 가능합니다.',
      };
    }
  }

  // 저녁: 17:00 ~ 22:00 (종료 22:00 = 1320분)
  if (targetSlot === '저녁') {
    if (totalMins >= 1320) {
      return {
        canRegister: false,
        reason: '저녁 식사 배틀(17:00 ~ 22:00)은 이미 종료되어 더 이상 등록할 수 없습니다.',
      };
    }
    if (totalMins < 1020) {
      return {
        canRegister: false,
        reason: '저녁 식사 배틀은 17:00부터 등록 가능합니다.',
      };
    }
  }

  return { canRegister: true };
}

/**
 * 멤버 이름으로 스타일 정보 찾기
 */
export function getMemberInfo(name: string): Member {
  const found = MEMBERS.find((m) => m.name === name);
  if (found) return found;
  return {
    id: 'unknown',
    name,
    avatarBg: 'bg-slate-700/50 text-slate-300',
    textColor: 'text-slate-300',
    borderColor: 'border-slate-600',
  };
}

/**
 * 2026-10-30 점심 타임까지의 구형 AI 모델 평가 여부 확인
 * (2026-10-30 저녁 타임부터 NVIDIA NIM 비전 모델 적용)
 */
export function isLegacyEvaluation(date?: string, slot?: MealSlot | string): boolean {
  if (!date) return false;
  if (date < '2026-10-30') return true;
  if (date === '2026-10-30') {
    return slot !== '저녁';
  }
  return false;
}

/**
 * AI 우승 배너 헤더 텍스트 반환
 * - 2026-10-30 점심까지: '(구)AI 심사 WINNER'
 * - 2026-10-30 저녁부터: 'AI 심사 WINNER'
 */
export function getWinnerHeaderText(date?: string, slot?: MealSlot | string): string {
  return isLegacyEvaluation(date, slot) ? '(구)AI 심사 WINNER' : 'AI 심사 WINNER';
}
