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
  BAR_LENGTH: 6.4,

  // 상품 상자 크기 (가로 W 0.60 × 높이 H 0.60 정사각형 밑면 < 내경 틈새 0.82 < 세로 길이 D 1.46)
  // 정사각형 단면(대각선 0.8485 > 틈새 0.82)은 유지하면서 길이를 살짝 줄이고 Bar 틈새를 소폭 넓혀 당첨 확률 상향
  BOX_W: 0.60,
  BOX_H: 0.60,
  BOX_D: 1.46,
  BOX_MASS: 1.55,

  // 낙하 승리 판정 Y 임계값 (Bar 아래 WIN 슈트 영역 진입)
  DROP_Y_THRESHOLD: -0.28,

  // 외곽 안전 벽 / 경사 가이드 범위 (Bar 바깥으로 탈출하지 않고 중앙 틈새로만 떨어지도록 설계)
  CABINET_HALF_X: 3.18,
  CABINET_HALF_Z: 1.52,

  // 크레인 이동 범위 및 속도 (길어진 집게 암에 맞춰 높이/하강 한계 최적화)
  CLAW_HOME_X: -2.65,
  CLAW_HOME_Z: 0.85,
  CLAW_HOME_Y: 2.68,
  CLAW_MIN_X: -2.65,
  CLAW_MAX_X: 2.65,
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

export const GACHA_SLOT_X = [-2.05, -0.68, 0.68, 2.05] as const;

/**
 * 슬롯별(1번~4번) 상자 규격 (이미지는 기존 유지, #1은 기존 정사각형 밑면 그대로 유지하고 #2~#4는 모양·크기 차별화)
 * 모든 4종 모두 Bar 내경(0.82) 위에서 안정적으로 안착되며 cannon-es 물리 기준 정상 낙하 가능 검증 완료
 */
export const GACHA_SLOT_BOX_DIMS = [
  { w: 0.60, h: 0.60, d: 1.46, mass: 1.55 }, // #1 프리렌: 기존 정사각형 밑면 그대로
  { w: 0.68, h: 0.44, d: 1.40, mass: 1.50 }, // #2 네즈코: 납작하고 와이드한 박스
  { w: 0.52, h: 0.68, d: 1.50, mass: 1.55 }, // #3 프리렌: 슬림하고 키 크며 살짝 긴 박스
  { w: 0.64, h: 0.54, d: 1.36, mass: 1.50 }, // #4 네즈코: 살짝 짧고 두툼한 컴팩트 박스
] as const;

export function getBoxDimensions(slotIndex: number) {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_BOX_DIMS.length - 1, slotIndex));
  return GACHA_SLOT_BOX_DIMS[safeIdx];
}

export const GACHA_COLOR_THEMES: GachaColorTheme[] = ['gold', 'cyan', 'rose', 'purple'];

export const GACHA_DEFAULT_REWARD_AMOUNT = 0.01; // 기본 당첨 상품: 0.01 SOL

/**
 * 슬롯 인덱스(0..3)에 대한 초기 안착 좌표 반환 (슬롯별 상자 높이 반영)
 */
export function getRestingBoxPosition(slotIndex: number): [number, number, number] {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const x = GACHA_SLOT_X[safeIdx];
  const { h } = getBoxDimensions(safeIdx);
  const y = GACHA_PHYSICS.BAR_Y + GACHA_PHYSICS.BAR_RADIUS + h / 2 + 0.01;
  const z = 0;
  return [x, y, z];
}

/**
 * 특정 슬롯에 새 미스터리 박스 1개 생성 (서버 측 보상 포함)
 */
export function createBoxForSlot(slotIndex: number, nowTs = Date.now()): GachaBoxItem {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const theme = GACHA_COLOR_THEMES[safeIdx % GACHA_COLOR_THEMES.length];
  const charLabel = safeIdx % 2 === 0 ? `프리렌 박스 #${safeIdx + 1}` : `네즈코 박스 #${safeIdx + 1}`;
  return {
    id: `box_s${safeIdx}_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
    slotIndex: safeIdx,
    label: charLabel,
    colorTheme: theme,
    position: getRestingBoxPosition(safeIdx),
    quaternion: [0, 0, 0, 1],
    rewardType: 'SOL',
    rewardAmount: GACHA_DEFAULT_REWARD_AMOUNT,
  };
}

/**
 * 초기 4개 박스 세팅 생성
 */
export function createInitialGachaBoxes(): GachaBoxItem[] {
  const nowTs = Date.now();
  return [0, 1, 2, 3].map((idx) => createBoxForSlot(idx, nowTs + idx));
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
