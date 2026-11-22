export type GachaColorTheme = 'gold' | 'cyan' | 'rose' | 'purple';

export type GachaRewardType = 'SOL';

export interface GachaBoxItem {
  id: string;
  slotIndex: number; // 0..3
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
}

export interface GachaMachineState {
  id: 'main_ufo_bridge';
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
