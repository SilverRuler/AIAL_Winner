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
  maskedIp?: string; // 화면 노출용 마스킹 IP (예: 211.123)
  isDeleted?: boolean; // 소프트 딜리트: 몽고디비 원본 기록 보존용 플래그
  deletedAt?: number; // 삭제 일시 타임스탬프
  deletedBy?: string; // 삭제 주체 ('author_ip' | 'admin')
  deletedIp?: string; // 삭제 시점 클라이언트 IP
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
  exifTakenAt?: string; // 카메라 원본 촬영 일시 (예: 2026-11-05 07:45)
  isWinner?: boolean; // 이번 타임대 AI 승자 여부
  score?: number; // AI 맛 점수 (0~100)
  aiReview?: string; // AI 심사평
  evaluatedAt?: number; // 평가 완료 시간 (timestamp)
  createdAt: number;
  updatedAt?: number;
  comments?: MealComment[]; // 게시글 댓글 목록
  views?: number; // 게시글 조회수 (1개 IP당 1회 카운트)
  viewedIps?: string[]; // 몽고디비 내부 중복 방지용 IP 목록 (UI 비공개)
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

export interface RankedScoreMeal extends MealEntry {
  rank: number;
  isTie: boolean;
  rankText: string;
}

export interface BestScoreTier {
  rank: number;
  score: number;
  isTie: boolean;
  meals: RankedScoreMeal[];
}

export interface BestScoreInfo {
  tiers: BestScoreTier[];
  allRankedMeals: RankedScoreMeal[];
  topScore: number;
  totalRankedMeals: number;
}

export interface OnChainSnapshot {
  status: string; // 'Success' | 'Failed'
  verified: boolean;
  slot: number; // 블록 슬롯 번호
  blockTime?: number; // 온체인 블록 타임스탬프 (초)
  blockTimeFormatted?: string; // 포맷된 일시
  fee?: string; // 수수료 (예: 0.000005 SOL)
  feeLamports?: number;
  sender?: string; // 보낸 지갑 주소
  recipient?: string; // 수신 지갑 주소
  signature: string; // 트랜잭션 해시
  transferredSol?: number; // 온체인에서 실제로 전송된 SOL 수량
  transferredSolFormatted?: string; // 포맷된 전송 수량 (예: '0.05 SOL')
  upbitSolPriceKrw?: number; // 전송 시점 업비트 SOL 시세 (원)
  upbitSolPriceFormatted?: string; // 포맷된 업비트 시세 (예: '128,900원')
  approxKrwValue?: string; // 보낸 SOL 양 대비 한화 환산 금액 (예: '약 6,445원')
  priceReferenceDate?: string; // 시세 기준 일시
  capturedAt: number; // 스냅샷 박제 시각
  capturedAtFormatted?: string;
  explorerUrl?: string;
}

export interface RewardItem {
  id: string;
  member: string; // 멤버 이름 (12명 중 1명)
  amount: number; // SOL 수량 (예: 0.05, 0.1)
  unit?: string; // 통화 단위 (기본 'SOL')
  title: string; // 지급 사유 / 타이틀 (예: 10월 4주차 우승 상금)
  txHash: string; // 솔라나 트랜잭션 해시 (Signature)
  date: string; // 지급일자 (YYYY-MM-DD)
  memo?: string; // 관리자 메모
  recipientWallet?: string; // 수신자 솔라나 지갑 주소 (선택)
  onChainSnapshot?: OnChainSnapshot; // 만료 대비 온체인 영구 박제 스냅샷
  createdAt: number;
  updatedAt?: number;
}

export interface RewardApplication {
  id: string;
  member: string; // 신청 멤버
  totalWins: number; // 신청 당시 총 승수
  requestedWins: number; // 신청 승수 (5의 배수)
  walletAddress?: string; // 솔라나 지갑 주소
  memo?: string; // 신청 메모
  status: 'pending' | 'completed' | 'rejected';
  createdAt: number;
  date: string;
}
