export type MealSlot = '아침' | '점심' | '저녁';

export interface Member {
  id: string;
  name: string;
  avatarBg: string;
  textColor: string;
  borderColor: string;
}

export interface MealComment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  ip?: string; // 몽고디비 원본 저장용 전체 IP
  maskedIp?: string; // 화면 노출용 마스킹 IP (예: 211.123.X.X)
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  slot: MealSlot; // '아침' | '점심' | '저녁'
  member: string; // 멤버 이름 (12명 중 1명)
  menuName: string; // 메뉴 이름
  comment?: string; // 코멘트 / 소개
  imageUrl: string; // 이미지 Data URI 또는 URL
  isWinner?: boolean; // 이번 타임대 AI 승자 여부
  score?: number; // AI 맛 점수 (0~100)
  aiReview?: string; // AI 심사평
  evaluatedAt?: number; // 평가 완료 시간 (timestamp)
  createdAt: number;
  updatedAt?: number;
  comments?: MealComment[]; // 게시글 댓글 목록
  ip?: string; // 몽고디비 내부 기록용 작성자 원본 IP (UI 비공개)
}

export interface MealSlotSummary {
  date: string;
  slot: MealSlot;
  totalEntries: number;
  winnerEntry?: MealEntry;
  evaluated: boolean;
  aiJudgeComment?: string;
}

export interface MemberWinStats {
  member: string;
  totalSubmissions: number;
  totalWins: number;
  winRate: number;
  lastWinDate?: string;
}

export interface BestWinnerInfo {
  member: string;
  winCount: number;
  totalSubmissions: number;
  winRate: number;
  latestWinDate?: string;
  latestWinSlot?: string;
  latestWinTime: number;
  isTieBreaker: boolean;
  winningMeals: MealEntry[];
  allMeals: MealEntry[];
}
