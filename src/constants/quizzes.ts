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
  answer?: string; // 주관식 정답 문자열
  validateSubjective?: (answer: string) => boolean;
  // 객관식
  options?: QuizOption[];
  correctOption?: number;
  // 메타데이터
  isCustom?: boolean;
  createdAt?: number;
}

/**
 * 기본 온체인 리워드 신청 퀴즈 풀 (모든 문제에서 reward.png 안내 이미지 노출)
 */
export const REWARD_QUIZ_POOL: QuizQuestion[] = [
  {
    id: 'upbit_sol_min',
    question: '업비트에서 요구하는 SOL 최소 입금 금액은 몇인가?',
    type: 'subjective',
    placeholder: '정답 입력 (예: 0.003)',
    answer: '0.01',
    showGuideImage: true,
    validateSubjective: (ans: string) => {
      const clean = ans.trim().toLowerCase().replace(/sol/g, '').replace(/개/g, '').replace(/\s+/g, '');
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
  {
    id: 'solana_outage_history',
    question: '솔라나는 체인 출시 이후, 네트워크가 한 번이라도 중단된 적이 있다.',
    type: 'objective',
    showGuideImage: true,
    options: [
      { no: 1, text: 'YES' },
      { no: 2, text: 'NO' },
    ],
    correctOption: 1,
  },
  {
    id: 'solana_stablecoins',
    question: '솔라나에는 USDT, USDC가 있다.',
    type: 'objective',
    showGuideImage: true,
    options: [
      { no: 1, text: 'USDC 만 있다.' },
      { no: 2, text: 'USDT 만 있다.' },
      { no: 3, text: 'USDT, USDC 모두 있다.' },
      { no: 4, text: 'USDT, USDC 모두 없다.' },
    ],
    correctOption: 3,
  },
];

/**
 * Fisher-Yates 알고리즘을 사용한 편향 없는 완벽한 무작위 셔플
 */
export function shuffleQuizzes<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 퀴즈 풀에서 지정된 개수(기본 2문제)를 무작위로 추출하여 반환 (편향 없는 균등 무작위 배정)
 */
export function getRandomQuizzes(
  poolOrCount: QuizQuestion[] | number = REWARD_QUIZ_POOL,
  maybeCount: number = 2
): QuizQuestion[] {
  let pool = REWARD_QUIZ_POOL;
  let count = 2;

  if (Array.isArray(poolOrCount)) {
    pool = poolOrCount.length > 0 ? poolOrCount : REWARD_QUIZ_POOL;
    count = typeof maybeCount === 'number' ? maybeCount : 2;
  } else if (typeof poolOrCount === 'number') {
    pool = REWARD_QUIZ_POOL;
    count = poolOrCount;
  }

  const shuffled = shuffleQuizzes(pool);
  return shuffled.slice(0, count);
}

/**
 * 특정 멤버가 푼 퀴즈 목록(solvedQuizIds)을 제외하고 퀴즈를 무작위 배정
 * - 전체 퀴즈 풀 중 아직 풀지 않은 문제(unsolvedPool)가 count개 이상이면: unsolvedPool에서 무작위 배정
 * - 만약 모든 문제를 다 풀었으면(unsolvedPool.length === 0): 전체 풀(pool)에서 다시 무작위 배정!
 * - 만약 아직 안 푼 문제가 1개만 남은 경우: 남은 1문제 + 이미 푼 문제 중 무작위 1문제 조합하여 count개 구성
 */
export function getRandomQuizzesForMember(
  poolOrCount: QuizQuestion[] | number = REWARD_QUIZ_POOL,
  solvedQuizIds: string[] = [],
  maybeCount: number = 2
): QuizQuestion[] {
  let pool = REWARD_QUIZ_POOL;
  let count = 2;

  if (Array.isArray(poolOrCount)) {
    pool = poolOrCount.length > 0 ? poolOrCount : REWARD_QUIZ_POOL;
    count = typeof maybeCount === 'number' ? maybeCount : 2;
  } else if (typeof poolOrCount === 'number') {
    pool = REWARD_QUIZ_POOL;
    count = poolOrCount;
  }

  if (!pool || pool.length === 0) return [];
  if (pool.length <= count) return shuffleQuizzes(pool);

  const solvedIds = Array.isArray(solvedQuizIds) ? solvedQuizIds : [];

  // 아직 안 푼 문제 목록 필터링
  const unsolvedPool = pool.filter((q) => !solvedIds.includes(q.id));

  // 만약 모든 문제를 다 풀었거나 남은 문제가 0개이면: 다시 전체 풀에서 무작위 배정
  if (unsolvedPool.length === 0) {
    return shuffleQuizzes(pool).slice(0, count);
  }

  // 아직 안 푼 문제가 충분히(count개 이상) 있으면: 아직 안 푼 문제들 중에서 무작위 배정
  if (unsolvedPool.length >= count) {
    return shuffleQuizzes(unsolvedPool).slice(0, count);
  }

  // 아직 안 푼 문제가 부족한 경우(예: 1개 남음): 남은 문제 전부 + 이미 푼 문제 중 무작위로 부족한 만큼 채움
  const solvedPool = pool.filter((q) => solvedIds.includes(q.id));
  const remaining = shuffleQuizzes(solvedPool).slice(0, count - unsolvedPool.length);
  return shuffleQuizzes([...unsolvedPool, ...remaining]);
}

/**
 * 주관식 퀴즈 정답 검증 유틸 (공백, 대소문자, 접미어 허용)
 */
export function isSubjectiveCorrect(userAnswer: string, quiz: QuizQuestion): boolean {
  if (quiz.validateSubjective) {
    return quiz.validateSubjective(userAnswer);
  }
  if (!quiz.answer) return false;

  const cleanUser = userAnswer
    .trim()
    .toLowerCase()
    .replace(/sol/g, '')
    .replace(/개/g, '')
    .replace(/\s+/g, '');
  const cleanExp = quiz.answer
    .trim()
    .toLowerCase()
    .replace(/sol/g, '')
    .replace(/개/g, '')
    .replace(/\s+/g, '');

  return cleanUser === cleanExp || cleanUser.includes(cleanExp);
}
