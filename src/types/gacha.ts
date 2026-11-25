export type GachaColorTheme = 'gold' | 'cyan' | 'rose' | 'purple';

export type GachaRewardType = 'SOL';

export interface GachaBoxItem {
  id: string;
  slotIndex: number; // 상품 종류 (0: 프리렌, 1: 네즈코, 2: 노엘 실바, 3: 레제)
  seatIndex?: number; // 물리 배치 좌석 (0..3, 왼쪽→오른쪽 X 위치)
  label: string;
  colorTheme: GachaColorTheme;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  // 서버 전용 필드 (클라이언트 GET 응답 시에는 노출하지 않음)
  rewardType?: GachaRewardType;
  rewardAmount?: number;
}

export interface GachaMachineLock {
  active: boolean;
  member: string | null;
  turnId: string | null;
  startedAt: number | null;
  expiresAt: number | null;
  totalPlays?: number;
  remainingPlays?: number;
  shotIndex?: number;
  paidTickets?: number;
  bonusPlays?: number;
}

export interface GachaMachineState {
  id: string; // e.g. 'ufo_machine_0' .. 'ufo_machine_5'
  machineIndex: number; // 0..5 (개별 뽑기판 번호)
  slotIndex: number; // 0..5 (해당 뽑기판 전용 상품 종류)
  machineLabel: string; // 예: '프리렌 박스 #1'
  items: GachaBoxItem[];
  lock: GachaMachineLock;
  lastPlayedBy?: string | null;
  lastPlayedAt?: number | null;
  lastActionSummary?: string | null;
  resetCount: number;
  updatedAt: number;
}

export interface GachaTicketBalance {
  member: string;
  tickets: number;
  totalEarned: number;
  totalPlayed: number;
  totalWins: number;
  updatedAt: number;
}

export interface GachaWinRecord {
  id: string;
  member: string;
  boxId: string;
  boxLabel: string;
  colorTheme: GachaColorTheme;
  rewardType: GachaRewardType;
  rewardAmount: number;
  unboxed: boolean;
  claimStatus: 'unclaimed' | 'pending' | 'completed';
  walletAddress?: string;
  memo?: string;
  notified?: boolean;
  createdAt: number;
  claimedAt?: number;
}
