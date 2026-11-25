import { GachaBoxItem, GachaColorTheme } from '@/types/gacha';

/**
 * UFO 브릿지 크레인 (2-Bar 하시와타시) 물리 및 스테이지 상수
 * Three.js 및 cannon-es가 동일한 좌표계와 치수를 사용하도록 단일 소스에서 관리
 */
export const GACHA_PHYSICS = {
  // 4개의 평행 Bar (중앙 빨간색 낙하용 2개 Bar 틈새 0.73으로 소폭 좁혀 난이도 상향 + 앞/뒤 외곽 높은 보조 Bar 2개)
  BAR_Y: 0.72,
  BAR_RADIUS: 0.09,
  BAR_HALF_Z: 0.455,      // 중앙 앞 Bar: +0.455, 뒤 Bar: -0.455 (중심 간격 0.91, 내경 틈새 0.73)
  OUTER_BAR_Y: 1.06,      // 외곽 Bar 높이 (중앙 Bar보다 Y축으로 높게 배치)
  OUTER_BAR_HALF_Z: 1.02, // 외곽 앞 Bar: +1.02, 뒤 Bar: -1.02 (중앙 Bar보다 바깥쪽에 배치)
  BAR_LENGTH: 7.8,        // 5개 슬롯 여유 배치를 위해 가로 확장 (기존 6.4 -> 7.8)

  // 상품 상자 크기 (기본 참조 치수)
  BOX_W: 0.60,
  BOX_H: 0.60,
  BOX_D: 1.46,
  BOX_MASS: 1.55,

  // 낙하 승리 판정 Y 임계값 (Bar 아래 WIN 슈트 영역 진입)
  DROP_Y_THRESHOLD: -0.28,

  // 외곽 안전 벽 / 경사 가이드 범위 (5개 슬롯 가로 확장에 맞춰 조정)
  CABINET_HALF_X: 3.88,
  CABINET_HALF_Z: 1.52,

  // 크레인 이동 범위 및 속도 (5개 슬롯 전체 커버)
  CLAW_HOME_X: -3.35,
  CLAW_HOME_Z: 0.85,
  CLAW_HOME_Y: 2.68,
  CLAW_MIN_X: -3.35,
  CLAW_MAX_X: 3.35,
  CLAW_MIN_Z: -0.85,
  CLAW_MAX_Z: 0.85,
  CLAW_DROP_Y: 1.24,      // 하강 시 집게 중심 Y (길어진 집게 끝단 y ≈ 0.57로 Bar 높이 0.72 아래까지 자연 도달)
  CLAW_LIFT_Y: 2.52,      // 들어올림 최고 높이
  MOVE_SPEED_X: 0.825,      // 초당 X 이동 속도 (기존 1.65의 1/2)
  MOVE_SPEED_Z: 0.625,      // 초당 Z 이동 속도 (기존 1.25의 1/2)
  CLAW_DESCEND_SPEED: 0.475, // 초당 집게 하강 속도 (기존 0.95의 1/2)

  // 턴 락 타임아웃 (25초 - 플레이 중 8초마다 하트비트로 자동 연장, 비정상 이탈 시 25초 내 자동 해제)
  LOCK_TTL_MS: 25 * 1000,
};

export const GACHA_SLOT_X = [-2.76, -1.38, 0, 1.38, 2.76] as const;
export const GACHA_TOTAL_SLOTS = GACHA_SLOT_X.length;
export const GACHA_ALL_SLOT_INDICES = [0, 1, 2, 3, 4] as const;

/**
 * 슬롯별(1번~5번) 상자 규격 및 난이도 단계 (중앙 Bar 내경 0.73 고정 기준, 평균 난이도 6.5 중상)
 * #1(5) · #2(6) · #5 바니카(6.5, 정사각형 와이드 스페셜) · #3(7) · #4(8)
 * 모든 5종 모두 Bar 위 안정 안착 및 cannon-es 물리 기준 정상 낙하 가능 검증 완료
 */
export const GACHA_SLOT_BOX_DIMS = [
  { w: 0.54, h: 0.52, d: 1.32, mass: 1.35 }, // #1 프리렌 (난이도 5): 가볍고 컴팩트하여 회전·기울기 공략이 수월한 박스
  { w: 0.60, h: 0.56, d: 1.44, mass: 1.55 }, // #2 네즈코 (난이도 6): 표준 규격·무게의 정석 아케이드 브릿지 박스
  { w: 0.63, h: 0.60, d: 1.50, mass: 1.68 }, // #3 노엘 실바 (난이도 7): 두툼하고 길며 묵직해 정밀 각도 조절이 필요한 박스
  { w: 0.66, h: 0.64, d: 1.58, mass: 1.80 }, // #4 레제 (난이도 8): 틈새 여유가 좁고 길고 무거운 고난도 마스터 박스
  { w: 0.90, h: 0.58, d: 1.08, mass: 1.70 }, // #5 바니카 (난이도 6.5): 정사각형에 가까운 와이드 박스 (옆세우기·누르기 공략 특화)
] as const;

export function getBoxDimensions(slotIndex: number) {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_BOX_DIMS.length - 1, slotIndex));
  return GACHA_SLOT_BOX_DIMS[safeIdx];
}

export const GACHA_COLOR_THEMES: GachaColorTheme[] = ['gold', 'cyan', 'rose', 'purple', 'rose'];

export const GACHA_DEFAULT_REWARD_AMOUNT = 0.01; // 레거시 기본값

/**
 * 슬롯별(1번~5번) 상자 리워드 금액 (SOL)
 * #1 프리렌: 0.003, #2 네즈코: 0.008, #3 노엘 실바: 0.01, #4 레제: 0.015, #5 바니카: 0.009 SOL
 */
export const GACHA_SLOT_REWARD_AMOUNTS = [0.003, 0.008, 0.01, 0.015, 0.009] as const;

export function getBoxRewardAmount(slotIndex: number): number {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_REWARD_AMOUNTS.length - 1, slotIndex));
  return GACHA_SLOT_REWARD_AMOUNTS[safeIdx];
}

/**
 * 슬롯(상품 종류)과 물리 좌석(0..3, 왼쪽→오른쪽)에 대한 초기 안착 좌표 반환
 */
export function getRestingBoxPosition(
  slotIndex: number,
  seatIndex: number = slotIndex
): [number, number, number] {
  const safeSlot = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const safeSeat = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, seatIndex));
  const x = GACHA_SLOT_X[safeSeat];
  const { h } = getBoxDimensions(safeSlot);
  const y = GACHA_PHYSICS.BAR_Y + GACHA_PHYSICS.BAR_RADIUS + h / 2 + 0.01;
  const z = 0;
  return [x, y, z];
}

/**
 * Fisher-Yates 무작위 셔플 유틸리티
 */
export function shuffleIndices(indices: number[], avoidIdentity = false): number[] {
  const arr = [...indices];
  const runShuffle = () => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  runShuffle();
  if (avoidIdentity && arr.length > 1 && arr.every((v, i) => v === indices[i])) {
    runShuffle();
    if (arr.every((v, i) => v === indices[i])) {
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
  }
  return arr;
}

/**
 * 특정 상품 종류(slotIndex)를 지정 좌석(seatIndex)에 생성 (서버 측 보상 포함)
 */
const GACHA_SLOT_LABELS = [
  '프리렌 박스 #1',
  '네즈코 박스 #2',
  '노엘 실바 박스 #3',
  '레제 박스 #4',
  '바니카 박스 #5',
] as const;

export function createBoxForSlot(
  slotIndex: number,
  nowTs = Date.now(),
  seatIndex: number = slotIndex
): GachaBoxItem {
  const safeSlot = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const safeSeat = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, seatIndex));
  const theme = GACHA_COLOR_THEMES[safeSlot % GACHA_COLOR_THEMES.length];
  const charLabel = GACHA_SLOT_LABELS[safeSlot] || `미스터리 박스 #${safeSlot + 1}`;
  return {
    id: `box_s${safeSlot}_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
    slotIndex: safeSlot,
    seatIndex: safeSeat,
    label: charLabel,
    colorTheme: theme,
    position: getRestingBoxPosition(safeSlot, safeSeat),
    quaternion: [0, 0, 0, 1],
    rewardType: 'SOL',
    rewardAmount: getBoxRewardAmount(safeSlot),
  };
}

/**
 * 초기 5개 박스 세팅 생성 (1번~5번 상품을 5개 좌석에 랜덤 배치)
 */
export function createInitialGachaBoxes(): GachaBoxItem[] {
  const nowTs = Date.now();
  const shuffledSlotTypes = shuffleIndices([...GACHA_ALL_SLOT_INDICES], true);
  return shuffledSlotTypes.map((slotType, seatIdx) =>
    createBoxForSlot(slotType, nowTs + seatIdx, seatIdx)
  );
}

/**
 * X 좌표에서 가장 가까운 물리 좌석 인덱스(0..3) 반환
 */
export function getNearestSeatIndex(x: number): number {
  let bestSeat = 0;
  let bestDist = Infinity;
  for (let i = 0; i < GACHA_SLOT_X.length; i++) {
    const d = Math.abs(x - GACHA_SLOT_X[i]);
    if (d < bestDist) {
      bestDist = d;
      bestSeat = i;
    }
  }
  return bestSeat;
}

/**
 * 클라이언트에 내려줄 때 서버 전용 보상 필드(rewardType, rewardAmount) 제거
 */
export function sanitizeBoxForClient(box: GachaBoxItem): Omit<GachaBoxItem, 'rewardType' | 'rewardAmount'> {
  return {
    id: box.id,
    slotIndex: box.slotIndex,
    label: box.label,
    colorTheme: box.colorTheme,
    position: box.position,
    quaternion: box.quaternion,
  };
}
