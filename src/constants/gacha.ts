import { GachaBoxItem, GachaColorTheme } from '@/types/gacha';

/**
 * UFO 브릿지 크레인 (2-Bar 하시와타시) 물리 및 스테이지 상수
 * Three.js 및 cannon-es가 동일한 좌표계와 치수를 사용하도록 단일 소스에서 관리
 */
export const GACHA_PHYSICS = {
  // 2개의 평행 Bar (X축 방향으로 길게 뻗고, Z축으로 간격 배치)
  BAR_Y: 0.72,
  BAR_RADIUS: 0.085,
  BAR_HALF_Z: 0.54,       // 앞 Bar: +0.54, 뒤 Bar: -0.54 (중심 간격 1.08, 내경 틈새 0.91)
  BAR_LENGTH: 6.4,

  // 상품 상자 크기 (가로 W < 내경 틈새 0.91 < 세로 D 1.24)
  // 정방향일 땐 두 Bar에 걸쳐 안정적으로 서 있고, 비틀리거나 들리면 Bar 사이 0.91 틈으로 통과 가능
  BOX_W: 0.84,
  BOX_H: 0.44,
  BOX_D: 1.24,
  BOX_MASS: 1.4,

  // 낙하 승리 판정 Y 임계값 (Bar 아래 WIN 슈트 영역 진입)
  DROP_Y_THRESHOLD: -0.28,

  // 외곽 안전 벽 / 경사 가이드 범위 (Bar 바깥으로 탈출하지 않고 중앙 틈새로만 떨어지도록 설계)
  CABINET_HALF_X: 3.18,
  CABINET_HALF_Z: 1.45,

  // 크레인 이동 범위 및 속도
  CLAW_HOME_X: -2.65,
  CLAW_HOME_Z: 0.85,
  CLAW_HOME_Y: 2.55,
  CLAW_MIN_X: -2.65,
  CLAW_MAX_X: 2.65,
  CLAW_MIN_Z: -0.85,
  CLAW_MAX_Z: 0.85,
  CLAW_DROP_Y: 0.96,      // 하강 시 집게 중심 Y (Bar 위 상자 높이에 최적화)
  CLAW_LIFT_Y: 2.35,      // 들어올림 최고 높이
  MOVE_SPEED_X: 1.65,     // 초당 X 이동 속도
  MOVE_SPEED_Z: 1.25,     // 초당 Z 이동 속도

  // 턴 락 타임아웃 (45초)
  LOCK_TTL_MS: 45 * 1000,
};

export const GACHA_SLOT_X = [-2.05, -0.68, 0.68, 2.05] as const;

export const GACHA_COLOR_THEMES: GachaColorTheme[] = ['gold', 'cyan', 'rose', 'purple'];

export const GACHA_DEFAULT_REWARD_AMOUNT = 0.02; // 기본 당첨 상품: 0.02 SOL

/**
 * 슬롯 인덱스(0..3)에 대한 초기 안착 좌표 반환
 */
export function getRestingBoxPosition(slotIndex: number): [number, number, number] {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const x = GACHA_SLOT_X[safeIdx];
  const y = GACHA_PHYSICS.BAR_Y + GACHA_PHYSICS.BAR_RADIUS + GACHA_PHYSICS.BOX_H / 2 + 0.01;
  const z = 0;
  return [x, y, z];
}

/**
 * 특정 슬롯에 새 미스터리 박스 1개 생성 (서버 측 보상 포함)
 */
export function createBoxForSlot(slotIndex: number, nowTs = Date.now()): GachaBoxItem {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_X.length - 1, slotIndex));
  const theme = GACHA_COLOR_THEMES[safeIdx % GACHA_COLOR_THEMES.length];
  return {
    id: `box_s${safeIdx}_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
    slotIndex: safeIdx,
    label: `SOL 캡슐 #${safeIdx + 1}`,
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
