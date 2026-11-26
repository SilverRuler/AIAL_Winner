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
  BAR_LENGTH: 3.6,        // 개별 1상품 전용 컴팩트 UFO 브릿지 (상품 간 충돌 원천 제거 & 확대 시야)

  // 상품 상자 크기 (기본 참조 치수)
  BOX_W: 0.60,
  BOX_H: 0.60,
  BOX_D: 1.46,
  BOX_MASS: 1.55,

  // 낙하 승리 판정 Y 임계값 (Bar 아래 WIN 슈트 영역 진입)
  DROP_Y_THRESHOLD: -0.28,

  // 외곽 안전 벽 / 경사 가이드 범위 (1상품 전용 뽑기판 — 외곽 파란 Bar와 전면 유리 간극 확대)
  CABINET_HALF_X: 1.78,
  CABINET_HALF_Z: 2.02,

  // 크레인 이동 범위 및 속도 (1상품 전용 뽑기판 — 항공뷰 (0,0) 좌하단 코너 시작 + 헤드 여유 높이)
  CLAW_HOME_X: -1.36,
  CLAW_HOME_Z: 1.42,
  CLAW_HOME_Y: 3.24,
  CLAW_MIN_X: -1.36,
  CLAW_MAX_X: 1.36,
  CLAW_MIN_Z: -1.18,
  CLAW_MAX_Z: 1.42,
  CLAW_DROP_Y: 1.24,      // 하강 시 집게 중심 Y (원래 크기 집게 끝단 y ≈ 0.55로 Bar 높이 0.72 아래까지 자연 도달)
  CLAW_LIFT_Y: 3.04,      // 들어올림 최고 높이
  MOVE_SPEED_X: 0.825,      // 초당 X 이동 속도 (기존 1.65의 1/2)
  MOVE_SPEED_Z: 0.625,      // 초당 Z 이동 속도 (기존 1.25의 1/2)
  CLAW_DESCEND_SPEED: 0.475, // 초당 집게 하강 속도 (기존 0.95의 1/2)

  // 턴 락 타임아웃 (25초 - 플레이 중 8초마다 하트비트로 자동 연장, 비정상 이탈 시 25초 내 자동 해제)
  LOCK_TTL_MS: 25 * 1000,
};

export const GACHA_SLOT_X = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const; // 개별 뽑기판(1판 1상품) 중앙 정위치
export const GACHA_TOTAL_SLOTS = 13;
export const GACHA_MACHINE_COUNT = GACHA_TOTAL_SLOTS;
export const GACHA_ALL_SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function getMachineDocId(machineIndex: number): string {
  const safeIdx = Math.max(0, Math.min(GACHA_MACHINE_COUNT - 1, Math.floor(machineIndex || 0)));
  return `ufo_machine_${safeIdx}`;
}

export function normalizeMachineIndex(raw: unknown, fallback = 0): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= GACHA_MACHINE_COUNT) return fallback;
  return n;
}

/**
 * 슬롯별(1번~12번) 상품 규격 및 난이도 단계 (피규어 박스 8종 + 3D 입체 인형 4종)
 */
export const GACHA_SLOT_BOX_DIMS = [
  { w: 0.58, h: 0.54, d: 1.38, mass: 1.40 }, // #1 페른 (난이도 5.5)
  { w: 1.06, h: 0.46, d: 1.08, mass: 1.46 }, // #2 키타가와 마린 3D 인형 (난이도 7)
  { w: 0.64, h: 0.58, d: 1.52, mass: 1.64 }, // #3 렘 (난이도 7.5)
  { w: 0.54, h: 0.52, d: 1.32, mass: 1.25 }, // #4 프리렌 (난이도 5)
  { w: 0.52, h: 0.44, d: 1.56, mass: 1.60 }, // #5 타야마 3D 인형 (난이도 8)
  { w: 0.90, h: 0.58, d: 1.08, mass: 1.58 }, // #6 바니카 (난이도 6.5, 정사각)
  { w: 0.62, h: 0.58, d: 1.48, mass: 1.56 }, // #7 루시 (난이도 7)
  { w: 0.94, h: 0.44, d: 1.44, mass: 1.52 }, // #8 하쿠네 미쿠 3D 인형 (난이도 7.5)
  { w: 0.60, h: 0.56, d: 1.44, mass: 1.48 }, // #9 네즈코 (난이도 6)
  { w: 0.66, h: 0.64, d: 1.58, mass: 1.76 }, // #10 레제 (난이도 8)
  { w: 0.96, h: 0.44, d: 1.36, mass: 1.32 }, // #11 산드로네 3D 인형 (난이도 6.5)
  { w: 0.56, h: 0.54, d: 1.36, mass: 1.34 }, // #12 시노부 (난이도 5.5)
  { w: 0.53, h: 0.44, d: 1.54, mass: 1.58 }, // #13 마키마 3D 인형 (난이도 7.5)
] as const;

export function isPlushSlot(slotIndex: number): boolean {
  return slotIndex === 1 || slotIndex === 4 || slotIndex === 7 || slotIndex === 10 || slotIndex === 12;
}

export function getBoxDimensions(slotIndex: number) {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_BOX_DIMS.length - 1, slotIndex));
  return GACHA_SLOT_BOX_DIMS[safeIdx];
}

export const GACHA_COLOR_THEMES: GachaColorTheme[] = [
  'purple', 'rose', 'cyan', 'gold', 'rose', 'rose',
  'cyan', 'cyan', 'cyan', 'purple', 'gold', 'purple', 'rose',
];

export const GACHA_DEFAULT_REWARD_AMOUNT = 0.01; // 레거시 기본값

/**
 * 슬롯별(1번~13번) 상품 리워드 금액 (SOL)
 */
export const GACHA_SLOT_REWARD_AMOUNTS = [
  0.006, 0.010, 0.012, 0.003, 0.014, 0.009,
  0.011, 0.012, 0.008, 0.015, 0.005, 0.005, 0.013,
] as const;

export function getBoxRewardAmount(slotIndex: number): number {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_REWARD_AMOUNTS.length - 1, slotIndex));
  return GACHA_SLOT_REWARD_AMOUNTS[safeIdx];
}

/**
 * 개별 뽑기판(1판 1상품) 중앙 정위치 안착 좌표 반환 (x = 0, z = 0)
 */
export function getRestingBoxPosition(
  slotIndex: number,
  _seatIndex: number = 0
): [number, number, number] {
  const safeSlot = Math.max(0, Math.min(GACHA_TOTAL_SLOTS - 1, slotIndex));
  const { h } = getBoxDimensions(safeSlot);
  const y = GACHA_PHYSICS.BAR_Y + GACHA_PHYSICS.BAR_RADIUS + h / 2 + 0.01;
  return [0, y, 0];
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
export const GACHA_SLOT_LABELS = [
  '페른 박스 #1',
  '키타가와 마린 3D 인형 #2',
  '렘 박스 #3',
  '프리렌 박스 #4',
  '타야마 3D 인형 #5',
  '바니카 박스 #6',
  '루시 박스 #7',
  '하쿠네 미쿠 3D 인형 #8',
  '네즈코 박스 #9',
  '레제 박스 #10',
  '산드로네 3D 인형 #11',
  '시노부 박스 #12',
  '마키마 3D 인형 #13',
] as const;

export const GACHA_SLOT_DIFFICULTY_TEXT = [
  '난이도 5.5 (보통)',
  '난이도 7 (3D 인형)',
  '난이도 7.5 (어려움)',
  '난이도 5 (보통)',
  '난이도 8 (3D 인형)',
  '난이도 6.5 (정사각)',
  '난이도 7 (어려움)',
  '난이도 7.5 (3D 인형)',
  '난이도 6 (중상)',
  '난이도 8 (고난도)',
  '난이도 6.5 (3D 인형)',
  '난이도 5.5 (보통)',
  '난이도 7.5 (3D 인형)',
] as const;

export function getMachineLabel(machineIndex: number): string {
  const safeIdx = normalizeMachineIndex(machineIndex, 0);
  return GACHA_SLOT_LABELS[safeIdx] || `미스터리 뽑기 #${safeIdx + 1}`;
}

export function createBoxForSlot(
  slotIndex: number,
  nowTs = Date.now(),
  seatIndex: number = 0
): GachaBoxItem {
  const safeSlot = Math.max(0, Math.min(GACHA_TOTAL_SLOTS - 1, slotIndex));
  const theme = GACHA_COLOR_THEMES[safeSlot % GACHA_COLOR_THEMES.length];
  const charLabel = GACHA_SLOT_LABELS[safeSlot] || `미스터리 박스 #${safeSlot + 1}`;
  return {
    id: `box_s${safeSlot}_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
    slotIndex: safeSlot,
    seatIndex,
    label: charLabel,
    colorTheme: theme,
    position: getRestingBoxPosition(safeSlot, 0),
    quaternion: [0, 0, 0, 1],
    isInitialState: true,
    rewardType: 'SOL',
    rewardAmount: getBoxRewardAmount(safeSlot),
  };
}

/**
 * 상품이 뽑기판 재정렬/초기화/리필 직후의 원위치 초기 상태인지 판정
 */
export function isBoxAtInitialPose(
  box: Pick<GachaBoxItem, 'slotIndex' | 'position' | 'quaternion' | 'isInitialState'>
): boolean {
  if (typeof box.isInitialState === 'boolean') {
    return box.isInitialState;
  }
  const restPos = getRestingBoxPosition(box.slotIndex, 0);
  const dx = Math.abs((box.position?.[0] ?? 0) - restPos[0]);
  const dy = Math.abs((box.position?.[1] ?? 0) - restPos[1]);
  const dz = Math.abs((box.position?.[2] ?? 0) - restPos[2]);
  const qw = Math.abs(box.quaternion?.[3] ?? 0);
  return dx <= 0.04 && dz <= 0.04 && dy <= 0.06 && qw >= 0.9985;
}

/**
 * 개별 뽑기판(machineIndex) 전용 1개 상품 초기 세팅 생성 (중앙 x=0 정위치)
 */
export function createSingleMachineItems(machineIndex: number, nowTs = Date.now()): GachaBoxItem[] {
  const safeSlot = normalizeMachineIndex(machineIndex, 0);
  return [createBoxForSlot(safeSlot, nowTs, 0)];
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
    isInitialState: isBoxAtInitialPose(box),
  };
}
