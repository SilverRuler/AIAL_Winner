import { GachaBoxItem, GachaColorTheme } from '@/types/gacha';

/**
 * UFO 브릿지 크레인 (2-Bar 하시와타시) + 인형 뽑기 + 밀판 물리 및 스테이지 상수
 * Three.js, Rapier3D, Jolt-Physics 및 서버가 동일한 좌표계와 치수를 사용하도록 단일 소스에서 관리
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

  // 낙하 승리 판정 Y 임계값 (Bar/밀판 아래 WIN 슈트 영역 진입)
  DROP_Y_THRESHOLD: -0.28,

  // 외곽 안전 벽 / 경사 가이드 범위
  CABINET_HALF_X: 1.78,
  CABINET_HALF_Z: 2.02,

  // 크레인 이동 범위 및 속도
  CLAW_HOME_X: -1.36,
  CLAW_HOME_Z: 1.42,
  CLAW_HOME_Y: 3.24,
  CLAW_MIN_X: -1.36,
  CLAW_MAX_X: 1.36,
  CLAW_MIN_Z: -1.18,
  CLAW_MAX_Z: 1.42,
  CLAW_DROP_Y: 1.44,
  CLAW_LIFT_Y: 3.04,
  MOVE_SPEED_X: 0.825,
  MOVE_SPEED_Z: 0.625,
  CLAW_DESCEND_SPEED: 0.475,

  // 턴 락 타임아웃 (25초 - 플레이 중 8초마다 하트비트로 자동 연장, 비정상 이탈 시 25초 내 자동 해제)
  LOCK_TTL_MS: 25 * 1000,
};

export const GACHA_SLOT_X = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
export const GACHA_TOTAL_SLOTS = 14;
export const GACHA_MACHINE_COUNT = GACHA_TOTAL_SLOTS;
export const GACHA_ALL_SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export type GachaMachineCategory = 'figure' | 'plush' | 'pusher';

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
 * 슬롯별(1번~14번) 상품 규격 및 난이도 단계 (피규어 8종 + 인형 5종 + 밀판 1종)
 */
export const GACHA_SLOT_BOX_DIMS = [
  { w: 0.58, h: 0.54, d: 1.38, mass: 1.40 }, // #1 페른(피규어)
  { w: 1.06, h: 0.46, d: 1.08, mass: 1.46 }, // #2 키타가와 마린(인형)
  { w: 0.64, h: 0.58, d: 1.52, mass: 1.64 }, // #3 렘(피규어)
  { w: 0.54, h: 0.52, d: 1.32, mass: 1.25 }, // #4 프리렌(피규어)
  { w: 0.52, h: 0.44, d: 1.56, mass: 1.60 }, // #5 타야마(인형)
  { w: 0.90, h: 0.58, d: 1.08, mass: 1.58 }, // #6 바니카(피규어)
  { w: 0.62, h: 0.58, d: 1.48, mass: 1.56 }, // #7 루시(피규어)
  { w: 0.94, h: 0.44, d: 1.44, mass: 1.52 }, // #8 하쿠네 미쿠(인형)
  { w: 0.60, h: 0.56, d: 1.44, mass: 1.48 }, // #9 네즈코(피규어)
  { w: 0.66, h: 0.64, d: 1.58, mass: 1.76 }, // #10 레제(피규어)
  { w: 0.96, h: 0.44, d: 1.36, mass: 1.32 }, // #11 산드로네(인형)
  { w: 0.56, h: 0.54, d: 1.36, mass: 1.34 }, // #12 시노부(피규어)
  { w: 0.53, h: 0.44, d: 1.54, mass: 1.58 }, // #13 마키마(인형)
  { w: 0.33, h: 0.28, d: 0.33, mass: 0.42 }, // #14 포켓몬(밀판 · 소형 캡슐)
] as const;

export function isPlushSlot(slotIndex: number): boolean {
  return slotIndex === 1 || slotIndex === 4 || slotIndex === 7 || slotIndex === 10 || slotIndex === 12;
}

export function isPusherSlot(slotIndex: number): boolean {
  return slotIndex === 13;
}

export function isFigureSlot(slotIndex: number): boolean {
  return !isPlushSlot(slotIndex) && !isPusherSlot(slotIndex);
}

export function getMachineCategory(slotIndex: number): GachaMachineCategory {
  if (isPusherSlot(slotIndex)) return 'pusher';
  if (isPlushSlot(slotIndex)) return 'plush';
  return 'figure';
}

export const PLUSH_MOUND_COUNT = 5;
export const PLUSH_MOUND_SCALE = 0.75;
export const PLUSH_FLOOR_Y = 0.00;
export const PLUSH_CHUTE_WALL_HEIGHT = 1.55;
export const PLUSH_CHUTE_HOME_X = -1.16;
export const PLUSH_CHUTE_HOME_Z = 1.06;

// #14 포켓몬(밀판) 스테이지 상수
export const PUSHER_DECK_COUNT = 8;
export const PUSHER_PIT_COUNT = 20;
export const PUSHER_TOTAL_COUNT = PUSHER_DECK_COUNT + PUSHER_PIT_COUNT; // 28개 캡슐
export const PUSHER_CAPSULE_RADIUS = 0.165;
export const PUSHER_CAPSULE_HEIGHT = 0.28;
export const PUSHER_DECK_Y = 0.36;           // 밀판 하단 고정 선반 윗면 Y
export const PUSHER_DECK_FRONT_Z = 0.50;     // 이 Z를 넘어가면 좌전방 WIN 배출구로 낙하
export const PUSHER_BARRICADE_X = -0.41;     // 좌측 밀판·투입구 vs 우측 캡슐존 사이 ㅣ 바리케이트
export const PUSHER_BARRICADE_H = 1.24;
export const PUSHER_SLIDER_WIDTH = 1.24;
export const PUSHER_SLIDER_HEIGHT = 0.26;
export const PUSHER_SLIDER_DEPTH = 0.90;     // halfD = 0.45
export const PUSHER_SLIDER_Z_BACK = -1.50;   // 후퇴 끝 (앞면 -1.05)
export const PUSHER_SLIDER_Z_FRONT = -0.96;  // 전진 끝 (앞면 -0.51)
export const PUSHER_SLIDER_SPEED = 2.35;     // rad/s (~2.67초 1왕복)
export const PUSHER_DROP_HOME_X = -1.10;     // 크레인 시작 & 밀판 위 드롭 지점 X
export const PUSHER_DROP_HOME_Z = -0.74;     // 크레인 시작 & 밀판 위 드롭 지점 Z (후퇴 밀대와 8개 캡슐 사이)
export const PUSHER_CHUTE_CENTER_X = -1.10;
export const PUSHER_CHUTE_CENTER_Z = 1.20;

export const POKEMON_CAPSULE_TYPES = [
  { key: 'see', name: '이상해씨', imgSrc: '/assets/pokemon_see.png', color: '#10b981', rim: '#6ee7b7' },
  { key: 'ggobu', name: '꼬부기', imgSrc: '/assets/pokemon_ggobu.png', color: '#0ea5e9', rim: '#7dd3fc' },
  { key: 'fire', name: '파이리', imgSrc: '/assets/pokemon_fire.png', color: '#f97316', rim: '#fdba74' },
] as const;

export function getPokemonCapsuleInfo(seatIndex: number, label?: string) {
  if (label) {
    if (label.includes('이상해씨')) return POKEMON_CAPSULE_TYPES[0];
    if (label.includes('꼬부기')) return POKEMON_CAPSULE_TYPES[1];
    if (label.includes('파이리')) return POKEMON_CAPSULE_TYPES[2];
  }
  const idx = Math.abs(Math.floor(seatIndex || 0)) % POKEMON_CAPSULE_TYPES.length;
  return POKEMON_CAPSULE_TYPES[idx];
}

export function getMachineFullItemCount(slotIndex: number): number {
  if (isPusherSlot(slotIndex)) return PUSHER_TOTAL_COUNT;
  if (isPlushSlot(slotIndex)) return PLUSH_MOUND_COUNT;
  return 1;
}

type PlushSeat = { x: number; z: number; layer: number; yaw: number };

function buildPlushScatterLayout5(): readonly PlushSeat[] {
  const seats: PlushSeat[] = [];
  const push = (x: number, z: number, yawDeg: number) => {
    const yaw = Number(((yawDeg * Math.PI) / 180).toFixed(3));
    seats.push({ x: Number(x.toFixed(3)), z: Number(z.toFixed(3)), layer: 0, yaw });
  };

  // 바닥 L자 필드 전역에 여유 있게 5개 산개 배치
  const wideScatter: Array<[number, number, number]> = [
    [-1.08, -1.10,   32],
    [ 0.24, -1.16,  -46],
    [ 1.18, -0.58,  124],
    [ 0.28,  0.22, -138],
    [ 1.06,  0.96,   54],
  ];
  wideScatter.forEach(([x, z, deg]) => push(x, z, deg));

  return seats;
}

const PLUSH_MOUND_LAYOUT: readonly PlushSeat[] = buildPlushScatterLayout5();

type PusherSeat = { x: number; y: number; z: number; yaw: number };

function buildPusherCapsuleLayout28(): readonly PusherSeat[] {
  const seats: PusherSeat[] = [];
  const deckY = Number((PUSHER_DECK_Y + PUSHER_CAPSULE_HEIGHT / 2 + 0.008).toFixed(3));
  const pitY0 = Number((PLUSH_FLOOR_Y + PUSHER_CAPSULE_HEIGHT / 2 + 0.008).toFixed(3));
  const pitY1 = Number((PLUSH_FLOOR_Y + PUSHER_CAPSULE_HEIGHT * 1.5 + 0.014).toFixed(3));

  const add = (x: number, y: number, z: number, deg: number) => {
    seats.push({
      x: Number(x.toFixed(3)),
      y,
      z: Number(z.toFixed(3)),
      yaw: Number(((deg * Math.PI) / 180).toFixed(3)),
    });
  };

  // 1) 좌측 밀판 위 기본 8개 캡슐 (앞줄 3 + 중줄 3 + 뒷줄 2, 배출구 경계 +0.50 직전에 아슬아슬하게 배치)
  const deckCoords: Array<[number, number, number]> = [
    [-1.46,  0.34,   12],
    [-1.10,  0.35,  -18],
    [-0.74,  0.34,   25],
    [-1.42,  0.00,  -30],
    [-1.08, -0.01,   15],
    [-0.75,  0.01,  -12],
    [-1.28, -0.34,   28],
    [-0.92, -0.34,  -22],
  ];
  deckCoords.forEach(([x, z, deg]) => add(x, deckY, z, deg));

  // 2) ㅣ 바리케이트(X=-0.41) 우측 상품 존 20개 캡슐 (바닥 14개 + 상단 6개 풍성하게 산개)
  const pitBottom14: Array<[number, number, number]> = [
    [-0.08, -1.36,   15],
    [ 0.44, -1.40,  -35],
    [ 0.96, -1.34,   48],
    [ 1.44, -1.26,  -20],
    [-0.04, -0.72,  -50],
    [ 0.50, -0.78,   22],
    [ 1.04, -0.68,  -14],
    [ 1.48, -0.56,   62],
    [-0.06, -0.04,   34],
    [ 0.48,  0.02,  -28],
    [ 1.02,  0.08,   18],
    [ 1.46,  0.22,  -45],
    [ 0.14,  0.82,   40],
    [ 0.92,  0.96,  -30],
  ];
  pitBottom14.forEach(([x, z, deg]) => add(x, pitY0, z, deg));

  const pitTop6: Array<[number, number, number]> = [
    [ 0.18, -1.06,  -18],
    [ 0.74, -1.04,   36],
    [ 1.24, -0.94,  -42],
    [ 0.22, -0.36,   52],
    [ 0.76, -0.32,  -25],
    [ 0.54,  0.48,   28],
  ];
  pitTop6.forEach(([x, z, deg]) => add(x, pitY1, z, deg));

  return seats;
}

const PUSHER_CAPSULE_LAYOUT: readonly PusherSeat[] = buildPusherCapsuleLayout28();

export function getPusherCapsulePose(
  seatIndex: number = 0
): { position: [number, number, number]; quaternion: [number, number, number, number] } {
  const seat = PUSHER_CAPSULE_LAYOUT[seatIndex % PUSHER_CAPSULE_LAYOUT.length];
  const halfYaw = seat.yaw / 2;
  return {
    position: [seat.x, seat.y, seat.z],
    quaternion: [0, Number(Math.sin(halfYaw).toFixed(4)), 0, Number(Math.cos(halfYaw).toFixed(4))],
  };
}

export function getPlushMoundPose(
  slotIndex: number,
  seatIndex: number = 0
): { position: [number, number, number]; quaternion: [number, number, number, number] } {
  const safeSlot = Math.max(0, Math.min(GACHA_TOTAL_SLOTS - 1, slotIndex));
  const { h } = getBoxDimensions(safeSlot);
  const scaledH = h * PLUSH_MOUND_SCALE;
  const seat = PLUSH_MOUND_LAYOUT[seatIndex % PLUSH_MOUND_LAYOUT.length];
  const baseY = PLUSH_FLOOR_Y + scaledH / 2 + 0.02;
  const y = baseY + seat.layer * (scaledH + 0.015);
  const halfYaw = seat.yaw / 2;
  return {
    position: [seat.x, Number(y.toFixed(3)), seat.z],
    quaternion: [0, Number(Math.sin(halfYaw).toFixed(4)), 0, Number(Math.cos(halfYaw).toFixed(4))],
  };
}

export function getBoxDimensions(slotIndex: number) {
  const safeIdx = Math.max(0, Math.min(GACHA_SLOT_BOX_DIMS.length - 1, slotIndex));
  return GACHA_SLOT_BOX_DIMS[safeIdx];
}

export function getSandboxRedBarSpec(machineIndex: number): {
  halfZ: number;
  passWidth: number;
  physicsGap: number;
  passMode: 'width' | 'side';
} {
  const safeIdx = normalizeMachineIndex(machineIndex, 0);
  const dims = getBoxDimensions(safeIdx);
  const useSidePass = isPlushSlot(safeIdx) || dims.w > dims.d - 0.35;
  const passWidth = useSidePass ? dims.h : dims.w;
  const ringRadius = GACHA_PHYSICS.BAR_RADIUS + 0.006;
  const desiredPhysicsGap = passWidth + 0.058;
  const halfZ = Number((desiredPhysicsGap / 2 + ringRadius).toFixed(3));
  const physicsGap = Number((halfZ * 2 - ringRadius * 2).toFixed(3));
  return {
    halfZ,
    passWidth,
    physicsGap,
    passMode: useSidePass ? 'side' : 'width',
  };
}

export function getSandboxRedBarHalfZ(machineIndex: number): number {
  return getSandboxRedBarSpec(machineIndex).halfZ;
}

export const GACHA_COLOR_THEMES: GachaColorTheme[] = [
  'purple', 'rose', 'cyan', 'gold', 'rose', 'rose',
  'cyan', 'cyan', 'cyan', 'purple', 'gold', 'purple', 'rose', 'gold',
];

export const GACHA_DEFAULT_REWARD_AMOUNT = 0.01;

/**
 * 슬롯별(1번~14번) 상품 리워드 금액 (SOL)
 */
export const GACHA_SLOT_REWARD_AMOUNTS = [
  0.0015, 0.001, 0.0025, 0.001, 0.001, 0.002,
  0.0025, 0.001, 0.002, 0.003, 0.001, 0.0015, 0.001, 0.001,
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

export const GACHA_SLOT_LABELS = [
  '페른 피규어 #1',
  '키타가와 마린 인형 #2',
  '렘 피규어 #3',
  '프리렌 피규어 #4',
  '타야마 인형 #5',
  '바니카 피규어 #6',
  '루시 피규어 #7',
  '하쿠네 미쿠 인형 #8',
  '네즈코 피규어 #9',
  '레제 피규어 #10',
  '산드로네 인형 #11',
  '시노부 피규어 #12',
  '마키마 인형 #13',
  '포켓몬 밀판 #14',
] as const;

export const GACHA_SLOT_SHORT_LABELS = [
  '1.페른(피규어)',
  '2.마린(인형)',
  '3.렘(피규어)',
  '4.프리렌(피규어)',
  '5.타야마(인형)',
  '6.바니카(피규어)',
  '7.루시(피규어)',
  '8.미쿠(인형)',
  '9.네즈코(피규어)',
  '10.레제(피규어)',
  '11.산드로네(인형)',
  '12.시노부(피규어)',
  '13.마키마(인형)',
  '14.포켓몬(밀판)',
] as const;

export const GACHA_SLOT_DIFFICULTY_TEXT = [
  '난이도 5.5 (피규어)',
  '난이도 7 (인형)',
  '난이도 7.5 (피규어)',
  '난이도 5 (피규어)',
  '난이도 8 (인형)',
  '난이도 6.5 (피규어)',
  '난이도 7 (피규어)',
  '난이도 7.5 (인형)',
  '난이도 6 (피규어)',
  '난이도 8 (피규어)',
  '난이도 6.5 (인형)',
  '난이도 5.5 (피규어)',
  '난이도 7.5 (인형)',
  '난이도 6.5 (밀판)',
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
  const isPlush = isPlushSlot(safeSlot);
  const isPusher = isPusherSlot(safeSlot);
  const poke = isPusher ? getPokemonCapsuleInfo(seatIndex) : null;
  const charLabel = isPusher && poke
    ? `${poke.name} 캡슐 #14`
    : GACHA_SLOT_LABELS[safeSlot] || `미스터리 피규어 #${safeSlot + 1}`;
  const pose = isPusher
    ? getPusherCapsulePose(seatIndex)
    : isPlush
    ? getPlushMoundPose(safeSlot, seatIndex)
    : {
        position: getRestingBoxPosition(safeSlot, 0),
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
      };
  return {
    id: `box_s${safeSlot}_${nowTs}_${seatIndex}_${Math.random().toString(36).substring(2, 7)}`,
    slotIndex: safeSlot,
    seatIndex,
    label: charLabel,
    colorTheme: theme,
    position: pose.position,
    quaternion: pose.quaternion,
    isInitialState: true,
    rewardType: 'SOL',
    rewardAmount: getBoxRewardAmount(safeSlot),
  };
}

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

export function createSingleMachineItems(machineIndex: number, nowTs = Date.now()): GachaBoxItem[] {
  const safeSlot = normalizeMachineIndex(machineIndex, 0);
  if (isPusherSlot(safeSlot)) {
    return Array.from({ length: PUSHER_TOTAL_COUNT }, (_, seatIdx) =>
      createBoxForSlot(safeSlot, nowTs + seatIdx, seatIdx)
    );
  }
  if (isPlushSlot(safeSlot)) {
    return Array.from({ length: PLUSH_MOUND_COUNT }, (_, seatIdx) =>
      createBoxForSlot(safeSlot, nowTs + seatIdx, seatIdx)
    );
  }
  return [createBoxForSlot(safeSlot, nowTs, 0)];
}

export function createInitialGachaBoxes(): GachaBoxItem[] {
  const nowTs = Date.now();
  const shuffledSlotTypes = shuffleIndices([...GACHA_ALL_SLOT_INDICES], true);
  return shuffledSlotTypes.map((slotType, seatIdx) =>
    createBoxForSlot(slotType, nowTs + seatIdx, seatIdx)
  );
}

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

export function sanitizeBoxForClient(box: GachaBoxItem): Omit<GachaBoxItem, 'rewardType' | 'rewardAmount'> {
  return {
    id: box.id,
    slotIndex: box.slotIndex,
    seatIndex: box.seatIndex,
    label: box.label,
    colorTheme: box.colorTheme,
    position: box.position,
    quaternion: box.quaternion,
    isInitialState: isBoxAtInitialPose(box),
  };
}
