export interface QuizOption {
  no: number;
  text: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'subjective' | 'objective';
  showGuideImage?: boolean;
  // 주관식
  placeholder?: string;
  validateSubjective?: (answer: string) => boolean;
  // 객관식
  options?: QuizOption[];
  correctOption?: number;
}

/**
 * 온체인 리워드 신청 퀴즈 풀 (총 4문제, 모든 문제에서 reward.png 안내 이미지 노출)
 */
export const REWARD_QUIZ_POOL: QuizQuestion[] = [
  {
    id: 'upbit_sol_min',
    question: '업비트에서 요구하는 SOL 최소 입금 금액은 몇인가?',
    type: 'subjective',
    placeholder: '정답 입력 (예: 0.003)',
    showGuideImage: true,
    validateSubjective: (ans: string) => {
      const clean = ans.trim().toLowerCase().replace(/sol/g, '').replace(/개/g, '').trim();
      return clean === '0.01';
    },
  },
  {
    id: 'solana_tx_expiry',
    question: '솔라나는 왜 전송기록(트랜잭션)이 일정 기간 후에 사라질까?',
    type: 'objective',
    showGuideImage: true,
    options: [
      { no: 1, text: '중앙화 체인이라서' },
      { no: 2, text: '익명성을 제공하고 싶어서' },
      { no: 3, text: '방대한 양의 트랜잭션을 전부 보관할 수 없어서' },
      { no: 4, text: '사토시 나카모토가 의도적으로 그렇게 만들어서' },
    ],
    correctOption: 3,
  },
  {
    id: 'solana_consensus',
    question: '솔라나의 합의 알고리즘은?',
    type: 'objective',
    showGuideImage: true,
    options: [
      { no: 1, text: '작업증명' },
      { no: 2, text: '지분증명' },
      { no: 3, text: '역사증명' },
      { no: 4, text: '위임증명' },
    ],
    correctOption: 3,
  },
  {
    id: 'solana_slot_speed',
    question: '솔라나의 1슬롯(블록) 평균 생성 속도는?',
    type: 'objective',
    showGuideImage: true,
    options: [
      { no: 1, text: '10분에 1슬롯' },
      { no: 2, text: '250ms에 1슬롯' },
      { no: 3, text: '1분에 1슬롯' },
      { no: 4, text: '30초에 1슬롯' },
    ],
    correctOption: 2,
  },
];

/**
 * 퀴즈 풀에서 지정된 개수(기본 2문제)를 무작위로 추출하여 반환
 */
export function getRandomQuizzes(count: number = 2): QuizQuestion[] {
  const shuffled = [...REWARD_QUIZ_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
