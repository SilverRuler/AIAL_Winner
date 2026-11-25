'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  ArrowRight,
  ArrowUp,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Camera,
  PackagePlus,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { GachaBoxItem } from '@/types/gacha';
import { GACHA_PHYSICS, getBoxDimensions, getBoxRewardAmount, isBoxAtInitialPose, isPlushSlot } from '@/constants/gacha';

type CameraView = 'front' | 'top' | 'right';

export type CranePhase =
  | 'idle'
  | 'ready_right'
  | 'moving_right'
  | 'ready_up'
  | 'moving_up'
  | 'descending'
  | 'closing'
  | 'lifting'
  | 'releasing'
  | 'settling';

export interface TurnFinishPayload {
  wonItemIds: string[];
  updatedItems: {
    id: string;
    position: [number, number, number];
    quaternion: [number, number, number, number];
    isInitialState?: boolean;
  }[];
  actionSummary: string;
}

interface UfoClawMachine3DProps {
  items: GachaBoxItem[];
  isMyTurn: boolean;
  lockedByOther: string | null;
  turnKey: string | null; // 새 턴 시작 시 변경되어 머신 상태를 ready_right로 전환
  onTurnFinish: (payload: TurnFinishPayload) => void;
  onStartTurnRequest?: () => void;
  canStartTurn: boolean;
  selectedMember: string;
  selectedMemberTickets: number;
  isStarting: boolean;
  isFinishing?: boolean;
  sessionProgress?: { current: number; total: number; bonusPlays: number } | null;
  otherSessionProgress?: { current: number; total: number } | null;
  machineIndex: number;
  machineCount: number;
  machineLabel: string;
  machineDifficulty: string;
  machineRewardSol: number;
  onPrevMachine: () => void;
  onNextMachine: () => void;
  onSelectMachine?: (idx: number) => void;
  machineSummaries?: Array<{
    index: number;
    shortName: string;
    hasStock: boolean;
    lockedBy: string | null;
  }>;
  isAdmin?: boolean;
  onAdminRefill?: () => void;
  onAdminReset?: () => void;
  isRefilling?: boolean;
  isResetting?: boolean;
}

function createSidePanelTexture(title: string, accent: string, bg: string, rewardSol: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 128);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 244, 116);

    ctx.fillStyle = accent;
    ctx.font = '900 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 128, 52);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`AIAL PRIZE · ${rewardSol} SOL`, 128, 88);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const FIGURE_SLOT_STYLES = [
  {
    imgSrc: '/gacha/frieren.png',
    frontAccent: '#bae6fd',
    frontBg: '#0369a1',
    sideAccent: '#7dd3fc',
    sideBg: '#0c4a6e',
    title: 'FRIEREN',
    isSquare: false,
  },
  {
    imgSrc: '/gacha/nezuko.png',
    frontAccent: '#fbcfe8',
    frontBg: '#be123c',
    sideAccent: '#f9a8d4',
    sideBg: '#881337',
    title: 'NEZUKO',
    isSquare: false,
  },
  {
    imgSrc: '/gacha/noel_silva.png',
    frontAccent: '#bfdbfe',
    frontBg: '#1d4ed8',
    sideAccent: '#93c5fd',
    sideBg: '#1e3a8a',
    title: 'NOEL SILVA',
    isSquare: false,
  },
  {
    imgSrc: '/gacha/reze.png',
    frontAccent: '#f5d0fe',
    frontBg: '#7e22ce',
    sideAccent: '#e879f9',
    sideBg: '#581c87',
    title: 'REZE',
    isSquare: false,
  },
  {
    imgSrc: '/gacha/vanica.png',
    frontAccent: '#fda4af',
    frontBg: '#9f1239',
    sideAccent: '#fb7185',
    sideBg: '#4c0519',
    title: 'VANICA',
    isSquare: true,
    isPlush: false,
  },
  {
    imgSrc: '/gacha/sandrone_plush.png',
    frontAccent: '#fde68a',
    frontBg: '#7f1d1d',
    sideAccent: '#f59e0b',
    sideBg: '#450a0a',
    title: 'SANDRONE',
    isSquare: false,
    isPlush: true,
  },
] as const;

interface PlushGeoJson {
  w: number;
  h: number;
  d: number;
  positions: number[];
  uvs: number[];
  indices: number[];
}

let cachedSandroneGeoData: PlushGeoJson | null = null;
let sandroneGeoPromise: Promise<PlushGeoJson | null> | null = null;

function loadSandronePlushGeoData(): Promise<PlushGeoJson | null> {
  if (cachedSandroneGeoData) return Promise.resolve(cachedSandroneGeoData);
  if (!sandroneGeoPromise) {
    sandroneGeoPromise = fetch('/gacha/sandrone_plush_geo.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlushGeoJson | null) => {
        if (data && Array.isArray(data.positions) && Array.isArray(data.indices)) {
          cachedSandroneGeoData = data;
          return data;
        }
        return null;
      })
      .catch(() => null);
  }
  return sandroneGeoPromise;
}

function buildBufferGeometryFromPlushData(data: PlushGeoJson): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geo.setIndex(data.indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createPlushMaterial(imgSrc: string): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const tex = loader.load(imgSrc);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.72,
    metalness: 0.04,
    alphaTest: 0.08,
  });
}

function getFigureSlotStyle(slotIndex: number) {
  const safeIdx = ((slotIndex % FIGURE_SLOT_STYLES.length) + FIGURE_SLOT_STYLES.length) % FIGURE_SLOT_STYLES.length;
  return FIGURE_SLOT_STYLES[safeIdx];
}

function createFigureFrontTexture(slotIndex: number, label: string): THREE.CanvasTexture {
  const style = getFigureSlotStyle(slotIndex);
  const { imgSrc, frontAccent: accent, frontBg: bg, title, isSquare } = style;

  const cw = isSquare ? 384 : 256;
  const ch = isSquare ? 440 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const drawArtwork = (loadedImg?: HTMLImageElement) => {
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    if (loadedImg && loadedImg.width > 0 && loadedImg.height > 0) {
      // 비율 유지 Cover 크롭으로 캐릭터 이미지 채우기 (정사각형 박스는 1:1 비율에 맞춰 풀프레임 출력)
      const drawW = cw - 16;
      const drawH = isSquare ? ch - 84 : ch - 16;
      const targetAspect = drawW / drawH;
      const srcAspect = loadedImg.width / loadedImg.height;
      let sx = 0, sy = 0, sw = loadedImg.width, sh = loadedImg.height;
      if (srcAspect > targetAspect) {
        sw = loadedImg.height * targetAspect;
        sx = (loadedImg.width - sw) / 2;
      } else {
        sh = loadedImg.width / targetAspect;
        sy = (loadedImg.height - sh) * 0.2;
      }
      ctx.drawImage(loadedImg, sx, sy, sw, sh, 8, 8, drawW, drawH);
    }

    // 피규어 박스 하단 타이틀 배너
    const bannerH = 70;
    const bannerY = ch - bannerH - 8;
    ctx.fillStyle = 'rgba(7, 11, 24, 0.84)';
    ctx.fillRect(8, bannerY, cw - 16, bannerH);

    ctx.fillStyle = accent;
    ctx.font = `900 ${isSquare ? 28 : 24}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, cw / 2, bannerY + 24);

    ctx.fillStyle = '#fde047';
    ctx.font = `bold ${isSquare ? 17 : 15}px monospace`;
    ctx.fillText(`${label} · ${getBoxRewardAmount(slotIndex)} SOL`, cw / 2, bannerY + 52);

    // 피규어 박스 테두리 프레임
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, cw - 10, ch - 10);

    tex.needsUpdate = true;
  };

  drawArtwork();

  if (typeof window !== 'undefined') {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => drawArtwork(img);
    img.src = imgSrc;
  }

  return tex;
}

function createFigureBoxMaterials(slotIndex: number, label: string): THREE.MeshStandardMaterial[] {
  const { sideAccent: accent, sideBg: bg, title } = getFigureSlotStyle(slotIndex);
  const rewardSol = getBoxRewardAmount(slotIndex);

  const frontTex = createFigureFrontTexture(slotIndex, label);
  const sideTex = createSidePanelTexture(title, accent, bg, rewardSol);

  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.24, metalness: 0.15 });
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.3, metalness: 0.25 });

  // BoxGeometry face order: +X, -X, +Y(Top), -Y(Bottom), +Z, -Z
  return [sideMat, sideMat, frontMat, frontMat, sideMat, sideMat];
}

export const UfoClawMachine3D: React.FC<UfoClawMachine3DProps> = ({
  items,
  isMyTurn,
  lockedByOther,
  turnKey,
  onTurnFinish,
  onStartTurnRequest,
  canStartTurn,
  selectedMember,
  selectedMemberTickets,
  isStarting,
  isFinishing = false,
  sessionProgress = null,
  otherSessionProgress = null,
  machineIndex,
  machineCount,
  machineLabel,
  machineDifficulty,
  machineRewardSol,
  onPrevMachine,
  onNextMachine,
  onSelectMachine,
  machineSummaries = [],
  isAdmin = false,
  onAdminRefill,
  onAdminReset,
  isRefilling = false,
  isResetting = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<CranePhase>('idle');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [droppedThisTurn, setDroppedThisTurn] = useState<number>(0);
  const [cameraView, setCameraView] = useState<CameraView>('front');
  const [frontTiptoeDeg, setFrontTiptoeDeg] = useState<number>(0); // 정면 까치발 각도 (0° ~ 45°, 조작 가능)
  const [clawFeedback, setClawFeedback] = useState<string>('');
  const [showExtremeDrr, setShowExtremeDrr] = useState<boolean>(false);
  const [showBalanceCatch, setShowBalanceCatch] = useState<boolean>(false);

  // Refs for animation loop access without re-creating Three.js scene
  const phaseRef = useRef<CranePhase>('idle');
  const soundEnabledRef = useRef<boolean>(true);
  const cameraViewRef = useRef<CameraView>('front');
  const frontTiptoeDegRef = useRef<number>(0);
  const itemsRef = useRef<GachaBoxItem[]>(items);
  const onTurnFinishRef = useRef(onTurnFinish);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const drrAudioRef = useRef<HTMLAudioElement | null>(null);
  const drrTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bcAudioRef = useRef<HTMLAudioElement | null>(null);
  const bcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const drrAudio = new Audio('/gacha/drr.mp3');
      drrAudio.preload = 'auto';
      drrAudio.volume = 0.85;
      drrAudioRef.current = drrAudio;

      const bcAudio = new Audio('/gacha/bc.mp3');
      bcAudio.preload = 'auto';
      bcAudio.volume = 0.9;
      bcAudioRef.current = bcAudio;
    }
    return () => {
      if (drrTimeoutRef.current) clearTimeout(drrTimeoutRef.current);
      if (bcTimeoutRef.current) clearTimeout(bcTimeoutRef.current);
    };
  }, []);

  const triggerExtremeDrr = useCallback(() => {
    setShowExtremeDrr(true);
    if (drrTimeoutRef.current) clearTimeout(drrTimeoutRef.current);
    drrTimeoutRef.current = setTimeout(() => {
      setShowExtremeDrr(false);
    }, 1000);
    if (soundEnabledRef.current && drrAudioRef.current) {
      try {
        drrAudioRef.current.currentTime = 0;
        drrAudioRef.current.play().catch(() => {});
      } catch {}
    }
  }, []);

  const triggerBalanceCatch = useCallback(() => {
    setShowBalanceCatch(true);
    if (bcTimeoutRef.current) clearTimeout(bcTimeoutRef.current);
    bcTimeoutRef.current = setTimeout(() => {
      setShowBalanceCatch(false);
    }, 1500);
    if (soundEnabledRef.current && bcAudioRef.current) {
      try {
        bcAudioRef.current.currentTime = 0;
        bcAudioRef.current.play().catch(() => {});
      } catch {}
    }
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  useEffect(() => {
    frontTiptoeDegRef.current = frontTiptoeDeg;
  }, [frontTiptoeDeg]);

  useEffect(() => {
    onTurnFinishRef.current = onTurnFinish;
  }, [onTurnFinish]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const setCranePhase = useCallback((next: CranePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Web Audio 간단한 아케이드 사운드 합성기
  const playTone = useCallback((freq: number, duration = 0.08, type: OscillatorType = 'triangle', gainVal = 0.08) => {
    if (!soundEnabledRef.current || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  // 턴 컨트롤 Refs (3D 루프 내부 제어용)
  const simControlRef = useRef<{
    clawX: number;
    clawY: number;
    clawZ: number;
    leftProngAngle: number;
    rightProngAngle: number;
    phaseTimer: number;
    settleQuietTime: number;
    wonSet: Set<string>;
    grabConstraint: CANNON.Constraint | null;
    syncFromItems: (nextItems: GachaBoxItem[]) => void;
    resetClawToHome: () => void;
  } | null>(null);

  // 새 턴 시작 감지 -> ready_right 진입 (항상 정면뷰로 자동 전환 + 최신 서버 좌표 items 즉시 반영)
  itemsRef.current = items;
  useEffect(() => {
    if (isMyTurn && turnKey) {
      setCameraView('front');
      cameraViewRef.current = 'front';
      setDroppedThisTurn(0);
      setClawFeedback('');
      if (simControlRef.current) {
        simControlRef.current.resetClawToHome();
        simControlRef.current.syncFromItems(items);
      }
      setCranePhase('ready_right');
      playTone(523.25, 0.12, 'sine', 0.1);
    } else if (!isMyTurn && phaseRef.current !== 'idle') {
      setCranePhase('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, turnKey, setCranePhase, playTone]);

  // 대기 상태에서 서버 폴링 또는 뽑기판 전환으로 items 변경 시 3D 씬 동기화 (본인 턴/저장 중이 아닐 때)
  useEffect(() => {
    if (!isMyTurn && !isFinishing && phaseRef.current === 'idle' && simControlRef.current) {
      simControlRef.current.syncFromItems(items);
    }
  }, [items, isMyTurn, isFinishing]);

  // 뽑기판 전환(이전/다음 뽑기) 시 대기 크레인 홈 위치 및 피드백 초기화
  useEffect(() => {
    if (!isMyTurn && !isFinishing && phaseRef.current === 'idle' && simControlRef.current) {
      setClawFeedback('');
      setDroppedThisTurn(0);
      simControlRef.current.resetClawToHome();
      simControlRef.current.syncFromItems(itemsRef.current);
    }
  }, [machineIndex, isMyTurn, isFinishing]);

  // Three.js + Cannon-es 씬 초기화
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 460;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b18');
    scene.fog = new THREE.FogExp2('#070b18', 0.045);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    let viewportW = width;
    let viewportH = height;

    const getCameraPose = (view: CameraView, w: number, h: number, tiptoeDeg = 0) => {
      const aspect = Math.max(0.55, w / Math.max(1, h));
      const scale = aspect < 1.48 ? Math.min(1.95, 1.52 / aspect) : 1.0;
      const fov = aspect < 1.15 ? 48 : 42;
      if (view === 'top') {
        // 항공뷰: 1상품 전용 컴팩트 UFO 브릿지를 위에서 선명하게 내려다봄
        return {
          fov,
          pos: new THREE.Vector3(0, 5.45 * Math.max(1, scale * 0.88), 0.52),
          look: new THREE.Vector3(0, 0.72, 0),
        };
      }
      if (view === 'right') {
        // 우측뷰: 오른쪽(+X) 측면에서 4-Bar 단면과 크레인 Z축 깊이를 정밀 확인
        return {
          fov,
          pos: new THREE.Vector3(4.55 * Math.max(1, scale * 0.85), 2.15 * (1 + (scale - 1) * 0.3), 0),
          look: new THREE.Vector3(0, 0.82, 0),
        };
      }
      // 정면뷰 (기본 0° + 까치발 최대 45° 상향 시점, 1상품 전용 확대 시야)
      const lookY = 0.76;
      const baseY = 3.25 * (1 + (scale - 1) * 0.62);
      const baseZ = 4.65 * scale;
      const clampedTiptoe = Math.max(0, Math.min(45, tiptoeDeg));
      if (clampedTiptoe <= 0) {
        return {
          fov,
          pos: new THREE.Vector3(0, baseY, baseZ),
          look: new THREE.Vector3(0, lookY, 0),
        };
      }
      const dy = baseY - lookY;
      const radius = Math.hypot(dy, baseZ);
      const baseElevRad = Math.atan2(dy, baseZ);
      const maxElevRad = (56.2 * Math.PI) / 180; // 까치발 45° 시 정면(28.3°)과 항공뷰(84°)의 중간 고각
      const elevRad = baseElevRad + (clampedTiptoe / 45) * (maxElevRad - baseElevRad);
      return {
        fov,
        pos: new THREE.Vector3(0, lookY + radius * Math.sin(elevRad), radius * Math.cos(elevRad)),
        look: new THREE.Vector3(0, lookY, 0),
      };
    };

    const currentLookAt = new THREE.Vector3(0, 0.78, 0);
    const applyResponsiveCamera = (w: number, h: number, snap = false) => {
      viewportW = w;
      viewportH = h;
      const aspect = Math.max(0.55, w / Math.max(1, h));
      const pose = getCameraPose(cameraViewRef.current, w, h, frontTiptoeDegRef.current);
      camera.aspect = aspect;
      camera.fov = pose.fov;
      if (snap) {
        camera.position.copy(pose.pos);
        currentLookAt.copy(pose.look);
        camera.lookAt(currentLookAt);
      }
      camera.updateProjectionMatrix();
    };
    applyResponsiveCamera(width, height, true);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lights
    const ambient = new THREE.AmbientLight('#cbd5e1', 0.85);
    scene.add(ambient);

    const mainSpot = new THREE.SpotLight('#fffbeb', 42, 22, Math.PI / 3.2, 0.45, 1.2);
    mainSpot.position.set(0, 6.5, 2.2);
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    scene.add(mainSpot);

    const cyanLight = new THREE.PointLight('#22d3ee', 10, 12);
    cyanLight.position.set(-2.1, 2.5, 1.2);
    scene.add(cyanLight);

    const amberLight = new THREE.PointLight('#f59e0b', 10, 12);
    amberLight.position.set(2.1, 2.5, 1.2);
    scene.add(amberLight);

    const chuteLight = new THREE.PointLight('#10b981', 8, 9);
    chuteLight.position.set(0, -0.7, 0);
    scene.add(chuteLight);

    // 3. Arcade Cabinet Visual Geometry (1상품 전용 컴팩트 가로 3.6 캐비닛)
    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // 하단 WIN CHUTE 바닥 (빛나는 배출구)
    const chuteGeo = new THREE.BoxGeometry(4.0, 0.15, 3.2);
    const chuteMat = new THREE.MeshStandardMaterial({
      color: '#064e3b',
      emissive: '#059669',
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.4,
    });
    const chuteFloor = new THREE.Mesh(chuteGeo, chuteMat);
    chuteFloor.position.set(0, -1.55, 0);
    chuteFloor.receiveShadow = true;
    cabinetGroup.add(chuteFloor);

    // 바닥 WIN 그리드 라인
    const gridHelper = new THREE.GridHelper(3.8, 10, '#10b981', '#065f46');
    gridHelper.position.set(0, -1.46, 0);
    cabinetGroup.add(gridHelper);

    // 4개 네온 코너 기둥
    const pillarGeo = new THREE.CylinderGeometry(0.07, 0.07, 4.9, 16);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      emissive: '#38bdf8',
      emissiveIntensity: 0.35,
      metalness: 0.7,
      roughness: 0.2,
    });
    const pillarX = GACHA_PHYSICS.CABINET_HALF_X + 0.1;
    const pillarCoords = [
      [-pillarX, 0.9, -1.48],
      [pillarX, 0.9, -1.48],
      [-pillarX, 0.9, 1.48],
      [pillarX, 0.9, 1.48],
    ];
    pillarCoords.forEach(([px, py, pz]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(px, py, pz);
      cabinetGroup.add(p);
    });

    // 상단 레일 프레임
    const frameBarMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.25 });
    const railSideGeo = new THREE.BoxGeometry(0.12, 0.12, 3.1);
    [-pillarX, pillarX].forEach((rx) => {
      const r = new THREE.Mesh(railSideGeo, frameBarMat);
      r.position.set(rx, 3.25, 0);
      cabinetGroup.add(r);
    });

    // 이동식 Z-갠트리 빔 & X-트롤리
    const gantryBeam = new THREE.Mesh(
      new THREE.BoxGeometry(GACHA_PHYSICS.BAR_LENGTH + 0.2, 0.1, 0.14),
      new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.85, roughness: 0.2 })
    );
    gantryBeam.position.set(0, 3.25, GACHA_PHYSICS.CLAW_HOME_Z);
    scene.add(gantryBeam);

    // 투명 아크릴 외곽 보호벽 (시야 방해 없이 박스 이탈 방지)
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(GACHA_PHYSICS.BAR_LENGTH + 0.16, 3.4), acrylicMat);
    backGlass.position.set(0, 0.8, -1.46);
    cabinetGroup.add(backGlass);

    [-(GACHA_PHYSICS.CABINET_HALF_X + 0.06), GACHA_PHYSICS.CABINET_HALF_X + 0.06].forEach((sx) => {
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.94, 3.4), acrylicMat);
      sideGlass.rotation.y = Math.PI / 2;
      sideGlass.position.set(sx, 0.8, 0);
      cabinetGroup.add(sideGlass);
    });

    // 경사 아크릴 가이드 (앞/뒤 바 외곽 영역)
    const rampVisualGeo = new THREE.BoxGeometry(GACHA_PHYSICS.BAR_LENGTH, 0.05, 0.84);
    const rampVisualMat = new THREE.MeshPhysicalMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.18,
      roughness: 0.2,
    });
    const frontRampMesh = new THREE.Mesh(rampVisualGeo, rampVisualMat);
    frontRampMesh.position.set(0, 1.24, 1.38);
    frontRampMesh.rotation.x = -0.72;
    cabinetGroup.add(frontRampMesh);

    const backRampMesh = new THREE.Mesh(rampVisualGeo, rampVisualMat);
    backRampMesh.position.set(0, 1.24, -1.38);
    backRampMesh.rotation.x = 0.72;
    cabinetGroup.add(backRampMesh);

    // 4개의 평행 UFO 브릿지 Bar (중앙 낙하용 2개 + 앞/뒤 외곽 높은 보조 Bar 2개)
    const barGeo = new THREE.CylinderGeometry(
      GACHA_PHYSICS.BAR_RADIUS,
      GACHA_PHYSICS.BAR_RADIUS,
      GACHA_PHYSICS.BAR_LENGTH,
      24
    );
    barGeo.rotateZ(Math.PI / 2);
    const barMatVisual = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      metalness: 0.9,
      roughness: 0.15,
    });
    const ringGeo = new THREE.TorusGeometry(GACHA_PHYSICS.BAR_RADIUS + 0.008, 0.015, 10, 24);
    ringGeo.rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#f43f5e',
      emissive: '#e11d48',
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });

    const allBarSpecs = [
      { y: GACHA_PHYSICS.BAR_Y, z: -GACHA_PHYSICS.BAR_HALF_Z, isOuter: false },
      { y: GACHA_PHYSICS.BAR_Y, z: GACHA_PHYSICS.BAR_HALF_Z, isOuter: false },
      { y: GACHA_PHYSICS.OUTER_BAR_Y, z: -GACHA_PHYSICS.OUTER_BAR_HALF_Z, isOuter: true },
      { y: GACHA_PHYSICS.OUTER_BAR_Y, z: GACHA_PHYSICS.OUTER_BAR_HALF_Z, isOuter: true },
    ];

    allBarSpecs.forEach(({ y: by, z: bz, isOuter }) => {
      const barMesh = new THREE.Mesh(barGeo, barMatVisual);
      barMesh.position.set(0, by, bz);
      barMesh.castShadow = true;
      barMesh.receiveShadow = true;
      cabinetGroup.add(barMesh);

      // 미끄럼방지 실리콘 링 배치 (1상품 전용 폭 커버)
      for (let rx = -1.5; rx <= 1.51; rx += 0.5) {
        const ring = new THREE.Mesh(ringGeo, isOuter ? outerRingMat : ringMat);
        ring.position.set(rx, by, bz);
        cabinetGroup.add(ring);
      }
    });

    // 4. UFO Claw Visual Assembly
    const clawGroup = new THREE.Group();
    scene.add(clawGroup);

    // 케이블 (와이어)
    const cableGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8);
    const cableMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    scene.add(cableMesh);

    // UFO 본체
    const ufoTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.34, 0.18, 24),
      new THREE.MeshStandardMaterial({
        color: '#0ea5e9',
        emissive: '#0284c7',
        emissiveIntensity: 0.45,
        metalness: 0.6,
        roughness: 0.25,
      })
    );
    ufoTop.position.set(0, 0.14, 0);
    ufoTop.castShadow = true;
    clawGroup.add(ufoTop);

    const ufoRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.032, 12, 24),
      new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#f59e0b',
        emissiveIntensity: 0.65,
      })
    );
    ufoRing.rotation.x = Math.PI / 2;
    ufoRing.position.set(0, 0.05, 0);
    clawGroup.add(ufoRing);

    // 좌/우 관절 집게 암 (실제 UFO 크레인처럼 상자를 감쌀 수 있도록 길게 연장)
    const armMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.2 });
    const tipMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#ea580c', emissiveIntensity: 0.25, roughness: 0.5 });

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.22, 0.02, 0);
    const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.50, 0.08), armMat);
    leftUpper.position.set(-0.09, -0.25, 0);
    leftUpper.rotation.z = -0.22;
    const leftTip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.12), tipMat);
    leftTip.position.set(-0.07, -0.60, 0);
    leftTip.rotation.z = 0.42;
    leftArmPivot.add(leftUpper, leftTip);
    clawGroup.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.22, 0.02, 0);
    const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.50, 0.08), armMat);
    rightUpper.position.set(0.09, -0.25, 0);
    rightUpper.rotation.z = 0.22;
    const rightTip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.12), tipMat);
    rightTip.position.set(0.07, -0.60, 0);
    rightTip.rotation.z = -0.42;
    rightArmPivot.add(rightUpper, rightTip);
    clawGroup.add(rightArmPivot);

    // 레이저 조준 링 (바닥/바 높이 가이드)
    const aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.21, 24),
      new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    aimRing.rotation.x = -Math.PI / 2;
    aimRing.position.set(GACHA_PHYSICS.CLAW_HOME_X, GACHA_PHYSICS.BAR_Y + 0.11, GACHA_PHYSICS.CLAW_HOME_Z);
    scene.add(aimRing);

    const aimBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.7, 8),
      new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.28 })
    );
    scene.add(aimBeam);

    // 5. Cannon-es Physics World
    const world = new CANNON.World();
    world.gravity.set(0, -14, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    (world.solver as CANNON.GSSolver).iterations = 16;

    const barPhysMat = new CANNON.Material('bar');
    const boxPhysMat = new CANNON.Material('box');
    const plushPhysMat = new CANNON.Material('plush');
    const clawPhysMat = new CANNON.Material('claw');

    world.addContactMaterial(
      new CANNON.ContactMaterial(barPhysMat, boxPhysMat, {
        friction: 0.44,
        restitution: 0.0, // 탱탱볼 튀어오름 완전 제거 (현실 종이 피규어 박스 감각)
        contactEquationStiffness: 1.2e6,
        contactEquationRelaxation: 6,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(barPhysMat, plushPhysMat, {
        friction: 0.54, // 봉제 쿠션 인형 특유의 패브릭 마찰감 & 말랑한 안착
        restitution: 0.0,
        contactEquationStiffness: 1.0e6,
        contactEquationRelaxation: 6,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(boxPhysMat, plushPhysMat, {
        friction: 0.46,
        restitution: 0.0,
        contactEquationStiffness: 1.0e6,
        contactEquationRelaxation: 6,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(boxPhysMat, boxPhysMat, {
        friction: 0.38,
        restitution: 0.0,
        contactEquationStiffness: 1.2e6,
        contactEquationRelaxation: 6,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(clawPhysMat, boxPhysMat, {
        friction: 0.55,
        restitution: 0.0,
        contactEquationStiffness: 1.0e6,
        contactEquationRelaxation: 6,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(clawPhysMat, plushPhysMat, {
        friction: 0.62,
        restitution: 0.0,
        contactEquationStiffness: 1.0e6,
        contactEquationRelaxation: 6,
      })
    );

    // 정적 물리 바디: 평행 Bar 4개 (중앙 낙하용 2개 + 앞/뒤 외곽 높은 보조 Bar 2개)
    allBarSpecs.forEach(({ y: by, z: bz }) => {
      const barBody = new CANNON.Body({ mass: 0, material: barPhysMat });
      const cylShape = new CANNON.Cylinder(
        GACHA_PHYSICS.BAR_RADIUS,
        GACHA_PHYSICS.BAR_RADIUS,
        GACHA_PHYSICS.BAR_LENGTH,
        16
      );
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, 0, Math.PI / 2);
      barBody.addShape(cylShape, new CANNON.Vec3(0, 0, 0), q);
      barBody.position.set(0, by, bz);
      world.addBody(barBody);
    });

    // 정적 물리 바디: 좌우 유리벽 및 앞뒤 경사 가이드(바 바깥으로 떨어지지 않고 중앙 Bar 틈새로 유도)
    [-GACHA_PHYSICS.CABINET_HALF_X - 0.1, GACHA_PHYSICS.CABINET_HALF_X + 0.1].forEach((wx) => {
      const wallBody = new CANNON.Body({ mass: 0, material: barPhysMat });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 2.0, 2.0)));
      wallBody.position.set(wx, 1.0, 0);
      world.addBody(wallBody);
    });

    // 앞 경사 가이드 (외곽 Bar 바깥쪽 보호 벽)
    const frontRampBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    frontRampBody.addShape(new CANNON.Box(new CANNON.Vec3(GACHA_PHYSICS.BAR_LENGTH / 2, 0.05, 0.42)));
    frontRampBody.position.set(0, 1.24, 1.38);
    frontRampBody.quaternion.setFromEuler(-0.72, 0, 0);
    world.addBody(frontRampBody);

    // 뒤 경사 가이드 (외곽 Bar 바깥쪽 보호 벽)
    const backRampBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    backRampBody.addShape(new CANNON.Box(new CANNON.Vec3(GACHA_PHYSICS.BAR_LENGTH / 2, 0.05, 0.42)));
    backRampBody.position.set(0, 1.24, -1.38);
    backRampBody.quaternion.setFromEuler(0.72, 0, 0);
    world.addBody(backRampBody);

    // 하단 WIN 슈트 바닥 콜라이더 (떨어진 상자가 안착)
    const floorBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(2.2, 0.1, 2.0)));
    floorBody.position.set(0, -1.55, 0);
    world.addBody(floorBody);

    // Kinematic 크레인 물리 바디 (무한 질량 반발 튀어오름 방지: collisionResponse=false, 실제 누르기/후킹은 정밀 힘 제어로 구현)
    const clawAnchorBody = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      mass: 0,
      material: clawPhysMat,
      collisionResponse: false,
    });
    clawAnchorBody.position.set(GACHA_PHYSICS.CLAW_HOME_X, GACHA_PHYSICS.CLAW_HOME_Y, GACHA_PHYSICS.CLAW_HOME_Z);
    world.addBody(clawAnchorBody);

    const clawHeadCollider = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      mass: 0,
      material: clawPhysMat,
      collisionResponse: false,
    });
    clawHeadCollider.addShape(new CANNON.Box(new CANNON.Vec3(0.18, 0.1, 0.14)));
    clawHeadCollider.position.set(GACHA_PHYSICS.CLAW_HOME_X, GACHA_PHYSICS.CLAW_HOME_Y, GACHA_PHYSICS.CLAW_HOME_Z);
    world.addBody(clawHeadCollider);

    // 동적 상품 박스 관리 맵
    interface BoxEntity {
      data: GachaBoxItem;
      mesh: THREE.Mesh;
      body: CANNON.Body;
    }
    const boxEntities = new Map<string, BoxEntity>();

    const syncFromItems = (nextItems: GachaBoxItem[]) => {
      const nextIds = new Set(nextItems.map((it) => it.id));

      // 제거된 박스 정리
      for (const [id, ent] of boxEntities.entries()) {
        if (!nextIds.has(id)) {
          scene.remove(ent.mesh);
          ent.mesh.geometry.dispose();
          if (Array.isArray(ent.mesh.material)) {
            ent.mesh.material.forEach((m) => m.dispose());
          } else {
            ent.mesh.material.dispose();
          }
          world.removeBody(ent.body);
          boxEntities.delete(id);
        }
      }

      // 추가 및 위치 동기화 (슬롯별 고유 크기·질량 및 입체 쿠션 인형 지오메트리/복합 콜라이더 반영)
      for (const it of nextItems) {
        let ent = boxEntities.get(it.id);
        if (!ent) {
          const dims = getBoxDimensions(it.slotIndex);
          const plushItem = isPlushSlot(it.slotIndex);
          let mesh: THREE.Mesh;
          let body: CANNON.Body;

          if (plushItem) {
            const style = getFigureSlotStyle(it.slotIndex);
            const plushMat = createPlushMaterial(style.imgSrc);
            const initialGeo = cachedSandroneGeoData
              ? buildBufferGeometryFromPlushData(cachedSandroneGeoData)
              : new THREE.BoxGeometry(dims.w * 0.7, dims.h, dims.d * 0.85);
            mesh = new THREE.Mesh(initialGeo, plushMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            if (!cachedSandroneGeoData) {
              const targetId = it.id;
              loadSandronePlushGeoData().then((geoData) => {
                if (!geoData) return;
                const liveEnt = boxEntities.get(targetId);
                if (!liveEnt) return;
                const nextGeo = buildBufferGeometryFromPlushData(geoData);
                liveEnt.mesh.geometry.dispose();
                liveEnt.mesh.geometry = nextGeo;
              });
            }

            // 산드로네 다이컷 쿠션 인형 실루엣에 맞춘 4파츠 복합 물리 콜라이더
            body = new CANNON.Body({
              mass: dims.mass,
              material: plushPhysMat,
              linearDamping: 0.45,
              angularDamping: 0.60,
            });
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.28, 0.21, 0.50)), new CANNON.Vec3(0.05, 0, 0.02));
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.19, 0.18, 0.20)), new CANNON.Vec3(0.04, 0, -0.44));
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.15, 0.16, 0.30)), new CANNON.Vec3(-0.30, 0, 0.24));
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.14, 0.17, 0.28)), new CANNON.Vec3(0.30, 0, 0.22));
            world.addBody(body);
          } else {
            const mats = createFigureBoxMaterials(it.slotIndex, it.label);
            mesh = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), mats);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            body = new CANNON.Body({
              mass: dims.mass,
              material: boxPhysMat,
              linearDamping: 0.42,
              angularDamping: 0.56,
            });
            body.addShape(
              new CANNON.Box(
                new CANNON.Vec3(dims.w / 2, dims.h / 2, dims.d / 2)
              )
            );
            world.addBody(body);
          }

          ent = { data: it, mesh, body };
          boxEntities.set(it.id, ent);
        }

        ent.data = it;
        ent.body.position.set(it.position[0], it.position[1], it.position[2]);
        ent.body.quaternion.set(it.quaternion[0], it.quaternion[1], it.quaternion[2], it.quaternion[3]);
        ent.body.velocity.set(0, 0, 0);
        ent.body.angularVelocity.set(0, 0, 0);

        ent.mesh.position.set(it.position[0], it.position[1], it.position[2]);
        ent.mesh.quaternion.set(it.quaternion[0], it.quaternion[1], it.quaternion[2], it.quaternion[3]);
      }
    };

    // 물리적 집게 개방 치수 상수 (Three.js Matrix4 기준 실측: angle=0.46 -> 좌/우 끝단 ±0.556, y=-0.666)
    const CLAW_OPEN_ANGLE = 0.46;
    const CLAW_OPEN_HALF_SPAN = 0.556;
    const CLAW_OPEN_SPAN = CLAW_OPEN_HALF_SPAN * 2; // 1.112
    const CLAW_TIP_DROP_Y = 0.666;

    const getBoxWorldSpanX = (body: CANNON.Body, dims: { w: number; h: number; d: number }) => {
      const ax = body.quaternion.vmult(new CANNON.Vec3(dims.w, 0, 0));
      const ay = body.quaternion.vmult(new CANNON.Vec3(0, dims.h, 0));
      const az = body.quaternion.vmult(new CANNON.Vec3(0, 0, dims.d));
      return Math.abs(ax.x) + Math.abs(ay.x) + Math.abs(az.x);
    };

    const getBoxWorldHalfHeight = (body: CANNON.Body, dims: { w: number; h: number; d: number }) => {
      const ax = body.quaternion.vmult(new CANNON.Vec3(dims.w / 2, 0, 0));
      const ay = body.quaternion.vmult(new CANNON.Vec3(0, dims.h / 2, 0));
      const az = body.quaternion.vmult(new CANNON.Vec3(0, 0, dims.d / 2));
      return Math.abs(ax.y) + Math.abs(ay.y) + Math.abs(az.y);
    };

    // 길어진 집게 끝단이 상자 외벽에 정확히 맞닿아 뚫고 들어가지 않도록 목표 닫힘 각도 계산
    const getCloseAngleForSpan = (spanX: number) => {
      // span(0.02)=0.464, span(0.46)=1.112 선형 보간
      const clampedSpan = Math.max(0.46, Math.min(CLAW_OPEN_SPAN, spanX + 0.02));
      const ratio = (clampedSpan - 0.464) / (1.112 - 0.464);
      return Math.max(0.04, Math.min(CLAW_OPEN_ANGLE - 0.04, 0.02 + ratio * 0.44));
    };

    const state = {
      clawX: GACHA_PHYSICS.CLAW_HOME_X,
      clawY: GACHA_PHYSICS.CLAW_HOME_Y,
      clawZ: GACHA_PHYSICS.CLAW_HOME_Z,
      leftProngAngle: CLAW_OPEN_ANGLE,
      rightProngAngle: CLAW_OPEN_ANGLE,
      startLeftCloseAngle: CLAW_OPEN_ANGLE,
      startRightCloseAngle: CLAW_OPEN_ANGLE,
      targetLeftCloseAngle: 0.06,
      targetRightCloseAngle: 0.06,
      clawTiltZ: 0,
      clawSwayX: 0,
      clawSwayZ: 0,
      clawSwayVelX: 0,
      clawSwayVelZ: 0,
      phaseTimer: 0,
      settleQuietTime: 0,
      wonSet: new Set<string>(),
      grabConstraint: null as CANNON.Constraint | null,
      grabSlipTime: 1.15,
      didSlipThisLift: false,
      isWeakGripThisTurn: false,
      leftBlockedBoxId: null as string | null,
      rightBlockedBoxId: null as string | null,
      bothBlockedOnTop: false,
      pushDownTimer: 0,
      passedBarGapCleanly: false,
      drrTriggeredThisTurn: false,
      balanceCatchTriggeredThisTurn: false,
      disturbedBoxIds: new Set<string>(),
      syncFromItems,
      resetClawToHome: () => {
        if (state.grabConstraint) {
          world.removeConstraint(state.grabConstraint);
          state.grabConstraint = null;
        }
        state.clawX = GACHA_PHYSICS.CLAW_HOME_X;
        state.clawY = GACHA_PHYSICS.CLAW_HOME_Y;
        state.clawZ = GACHA_PHYSICS.CLAW_HOME_Z;
        state.leftProngAngle = CLAW_OPEN_ANGLE;
        state.rightProngAngle = CLAW_OPEN_ANGLE;
        state.startLeftCloseAngle = CLAW_OPEN_ANGLE;
        state.startRightCloseAngle = CLAW_OPEN_ANGLE;
        state.targetLeftCloseAngle = 0.06;
        state.targetRightCloseAngle = 0.06;
        state.clawTiltZ = 0;
        state.clawSwayX = 0;
        state.clawSwayZ = 0;
        state.clawSwayVelX = 0;
        state.clawSwayVelZ = 0;
        state.phaseTimer = 0;
        state.settleQuietTime = 0;
        state.grabSlipTime = 1.15;
        state.didSlipThisLift = false;
        state.isWeakGripThisTurn = false;
        state.leftBlockedBoxId = null;
        state.rightBlockedBoxId = null;
        state.bothBlockedOnTop = false;
        state.pushDownTimer = 0;
        state.passedBarGapCleanly = false;
        state.drrTriggeredThisTurn = false;
        state.balanceCatchTriggeredThisTurn = false;
        state.disturbedBoxIds.clear();
        state.wonSet.clear();
      },
    };
    simControlRef.current = state;
    syncFromItems(itemsRef.current);

    // 6. Main Animation & Physics Loop
    let animId = 0;
    let lastTime = performance.now();

    const finishTurn = () => {
      if (state.grabConstraint) {
        world.removeConstraint(state.grabConstraint);
        state.grabConstraint = null;
      }
      const wonItemIds = Array.from(state.wonSet);
      const updatedItems = Array.from(boxEntities.values()).map((ent) => {
        const wasInitial = isBoxAtInitialPose(ent.data);
        const movedHoriz =
          Math.hypot(
            ent.body.position.x - ent.data.position[0],
            ent.body.position.z - ent.data.position[2]
          ) > 0.02;
        const quatDot = Math.abs(
          ent.body.quaternion.x * ent.data.quaternion[0] +
            ent.body.quaternion.y * ent.data.quaternion[1] +
            ent.body.quaternion.z * ent.data.quaternion[2] +
            ent.body.quaternion.w * ent.data.quaternion[3]
        );
        const nextIsInitial =
          wasInitial && !state.disturbedBoxIds.has(ent.data.id) && !movedHoriz && quatDot >= 0.999;
        ent.data.isInitialState = nextIsInitial;

        return {
          id: ent.data.id,
          position: [ent.body.position.x, ent.body.position.y, ent.body.position.z] as [number, number, number],
          quaternion: [
            ent.body.quaternion.x,
            ent.body.quaternion.y,
            ent.body.quaternion.z,
            ent.body.quaternion.w,
          ] as [number, number, number, number],
          isInitialState: nextIsInitial,
        };
      });

      setCranePhase('idle');
      onTurnFinishRef.current({
        wonItemIds,
        updatedItems,
        actionSummary: wonItemIds.length > 0 ? `${wonItemIds.length}개 획득` : '위치 이동',
      });
    };

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const curPhase = phaseRef.current;

      // 크레인 위치/단계 제어 (와이어 진자 관성 흔들림 포함)
      const prevClawX = state.clawX;
      const prevClawZ = state.clawZ;

      if (curPhase === 'moving_right') {
        state.clawX = Math.min(GACHA_PHYSICS.CLAW_MAX_X, state.clawX + GACHA_PHYSICS.MOVE_SPEED_X * dt);
        if (state.clawX >= GACHA_PHYSICS.CLAW_MAX_X) {
          setCranePhase('ready_up');
          playTone(620, 0.08);
        }
      } else if (curPhase === 'moving_up') {
        state.clawZ = Math.max(GACHA_PHYSICS.CLAW_MIN_Z, state.clawZ - GACHA_PHYSICS.MOVE_SPEED_Z * dt);
        if (state.clawZ <= GACHA_PHYSICS.CLAW_MIN_Z) {
          state.phaseTimer = 0;
          setCranePhase('descending');
          playTone(440, 0.12);
        }
      } else if (curPhase === 'descending') {
        // 현재 프레임 집게 끝단의 정확한 3D 월드 좌표 계산을 위해 먼저 트랜스폼 갱신
        clawGroup.position.set(state.clawX, state.clawY, state.clawZ);
        clawGroup.rotation.z = state.clawTiltZ;
        clawGroup.rotation.x = state.clawSwayZ;
        leftArmPivot.rotation.z = -state.leftProngAngle;
        rightArmPivot.rotation.z = state.rightProngAngle;
        clawGroup.updateMatrixWorld(true);

        const leftTipVec3 = leftTip.localToWorld(new THREE.Vector3(0, -0.18, 0));
        const rightTipVec3 = rightTip.localToWorld(new THREE.Vector3(0, -0.18, 0));
        const leftTipWorld = new CANNON.Vec3(leftTipVec3.x, leftTipVec3.y, leftTipVec3.z);
        const rightTipWorld = new CANNON.Vec3(rightTipVec3.x, rightTipVec3.y, rightTipVec3.z);
        const ufoBottomWorld = new CANNON.Vec3(state.clawX, state.clawY - 0.06, state.clawZ);

        // 중앙 빨간 Bar(z = ±0.455) 근처 통과 감지 (외곽 파란 Bar 제외, 위/아래 모두 포함):
        for (const tip of [leftTipWorld, rightTipWorld]) {
          for (const bar of allBarSpecs) {
            if (bar.isOuter) continue;
            if (Math.abs(tip.z - bar.z) <= 0.28) {
              state.passedBarGapCleanly = true;
              break;
            }
          }
          if (state.passedBarGapCleanly) break;
        }

        // 현실 아케이드 UFO 캐쳐 하강 물리:
        // - 한쪽 집게만 상자에 걸린 경우: 크레인 머리가 포기하고 멈추지 않고 끝까지 하강!
        //   걸린 집게는 상자 위를 뚫지 않도록 자연스럽게 힌지 개방 + 상자 누르기 힘을 가하고,
        //   반대쪽(자유) 집게는 상자 옆구리/아래까지 끝까지 내려가 확실하게 집어올림!
        // - 양쪽 집게 모두 상자 위에 걸리거나 UFO 본체 하단이 상자에 닿은 경우에만 지그시 누르다 정지!
        let stopDescend = false;
        let curHitLeftId: string | null = null;
        let curHitRightId: string | null = null;
        let bothTipsPressing = false;
        let ufoBodyPressing = false;
        let boxStillSinking = false;
        let maxHardPenetration = 0;

        const applySmoothPressAtTip = (
          ent: BoxEntity,
          dims: { w: number; h: number; d: number },
          tipWorld: CANNON.Vec3,
          baseForce: number
        ): { hit: boolean; pen: number } => {
          const loc = ent.body.pointToLocalFrame(tipWorld);
          const insideXZ =
            Math.abs(loc.x) <= dims.w / 2 + 0.035 &&
            Math.abs(loc.z) <= dims.d / 2 + 0.035;
          const touchingTop =
            loc.y <= dims.h / 2 + 0.045 &&
            loc.y >= -dims.h / 2 - 0.04;
          if (!insideXZ || !touchingTop) return { hit: false, pen: 0 };

          const pen = Math.max(0, dims.h / 2 + 0.03 - loc.y);
          const clampedLoc = new CANNON.Vec3(
            Math.max(-dims.w / 2, Math.min(dims.w / 2, loc.x)),
            Math.max(-dims.h / 2, Math.min(dims.h / 2, loc.y)),
            Math.max(-dims.d / 2, Math.min(dims.d / 2, loc.z))
          );
          const worldContact = ent.body.pointToWorldFrame(clampedLoc);
          const relPt = worldContact.vsub(ent.body.position);

          const fDown = baseForce + Math.min(44, pen * 240);
          ent.body.applyForce(new CANNON.Vec3(0, -fDown, 0), relPt);

          if (ent.body.velocity.y > 0) ent.body.velocity.y = 0;
          ent.body.angularVelocity.scale(0.92, ent.body.angularVelocity);

          if (ent.body.velocity.y < -0.05) {
            boxStillSinking = true;
          }
          return { hit: true, pen };
        };

        for (const ent of boxEntities.values()) {
          if (state.wonSet.has(ent.data.id)) continue;
          const dims = getBoxDimensions(ent.data.slotIndex);

          const leftRes = applySmoothPressAtTip(ent, dims, leftTipWorld, 40);
          const rightRes = applySmoothPressAtTip(ent, dims, rightTipWorld, 40);

          if (leftRes.hit) {
            curHitLeftId = ent.data.id;
            state.leftBlockedBoxId = ent.data.id;
            state.disturbedBoxIds.add(ent.data.id);
          }
          if (rightRes.hit) {
            curHitRightId = ent.data.id;
            state.rightBlockedBoxId = ent.data.id;
            state.disturbedBoxIds.add(ent.data.id);
          }

          if (leftRes.hit && rightRes.hit) {
            state.bothBlockedOnTop = true;
            bothTipsPressing = true;
            maxHardPenetration = Math.max(maxHardPenetration, leftRes.pen, rightRes.pen);
            const gapNudgeZ = -Math.sign(ent.body.position.z) * Math.min(4.0, Math.abs(ent.body.position.z) * 6.0);
            ent.body.applyForce(new CANNON.Vec3(0, 0, gapNudgeZ), new CANNON.Vec3(0, 0, 0));
          } else if (leftRes.hit && !rightRes.hit) {
            // 좌측 집게만 상자 윗면에 걸림 -> 크레인 머리는 끝까지 계속 하강!
            // 좌측 암은 상자를 뚫지 않고 윗면을 타고 자연스럽게 힌지 개방 + UFO 헤드 기울어짐, 우측 암은 끝까지 직하강!
            const targetFlexAngle = Math.min(0.92, state.leftProngAngle + Math.max(0.08, leftRes.pen * 3.8));
            state.leftProngAngle += (targetFlexAngle - state.leftProngAngle) * Math.min(1, 12 * dt);
            state.rightProngAngle += (CLAW_OPEN_ANGLE - state.rightProngAngle) * Math.min(1, 10 * dt);
            state.clawTiltZ += (-0.22 - state.clawTiltZ) * Math.min(1, 7 * dt);
          } else if (rightRes.hit && !leftRes.hit) {
            // 우측 집게만 상자 윗면에 걸림 -> 크레인 머리는 끝까지 계속 하강!
            // 우측 암은 상자 윗면을 타고 자연스럽게 힌지 개방 + UFO 헤드 기울어짐, 좌측 암은 끝까지 직하강!
            const targetFlexAngle = Math.min(0.92, state.rightProngAngle + Math.max(0.08, rightRes.pen * 3.8));
            state.rightProngAngle += (targetFlexAngle - state.rightProngAngle) * Math.min(1, 12 * dt);
            state.leftProngAngle += (CLAW_OPEN_ANGLE - state.leftProngAngle) * Math.min(1, 10 * dt);
            state.clawTiltZ += (0.22 - state.clawTiltZ) * Math.min(1, 7 * dt);
          }

          // UFO 본체 하단이 상자 윗면에 실제로 맞닿았을 때만 지그시 누르며 정지
          const uLoc = ent.body.pointToLocalFrame(ufoBottomWorld);
          if (
            Math.abs(uLoc.x) <= dims.w / 2 + 0.10 &&
            Math.abs(uLoc.z) <= dims.d / 2 - 0.02 &&
            uLoc.y <= dims.h / 2 + 0.02 &&
            uLoc.y >= -dims.h / 2
          ) {
            ufoBodyPressing = true;
            state.disturbedBoxIds.add(ent.data.id);
            const uPen = Math.max(0, dims.h / 2 + 0.02 - uLoc.y);
            if (uPen > maxHardPenetration) maxHardPenetration = uPen;
            const clampedU = new CANNON.Vec3(
              Math.max(-dims.w / 2, Math.min(dims.w / 2, uLoc.x)),
              Math.max(-dims.h / 2, Math.min(dims.h / 2, uLoc.y)),
              Math.max(-dims.d / 2, Math.min(dims.d / 2, uLoc.z))
            );
            const relU = ent.body.pointToWorldFrame(clampedU).vsub(ent.body.position);
            ent.body.applyForce(new CANNON.Vec3(0, -24, 0), relU);
            if (ent.body.velocity.y > 0) ent.body.velocity.y = 0;
            ent.body.angularVelocity.scale(0.92, ent.body.angularVelocity);
            if (ent.body.velocity.y < -0.05) boxStillSinking = true;
          }
        }

        // 하강 속도 제어:
        // - 양발 모두 막힘 또는 UFO 본체가 직접 상자 위에 닿음 -> 0.50초간 지그시 누른 뒤 정지
        // - 한쪽 집게만 걸림 -> 절대 중도 포기하지 않고 0.38 속도로 끝(CLAW_DROP_Y)까지 하강해 반대쪽 집게가 완전히 파고들도록 함!
        // - 양쪽 모두 안 걸림 -> 정상 하강
        let descendRate = GACHA_PHYSICS.CLAW_DESCEND_SPEED;
        if (bothTipsPressing || ufoBodyPressing) {
          if (boxStillSinking || maxHardPenetration < 0.065) {
            descendRate = 0.22;
            state.pushDownTimer += dt * 0.45;
          } else {
            descendRate = 0.025;
            state.pushDownTimer += dt;
          }
          if (state.pushDownTimer >= 0.50) {
            stopDescend = true;
          }
        } else if (curHitLeftId || curHitRightId) {
          // 한쪽 집게만 상자 위를 누르며 내려가는 중 -> 반대쪽 집게가 끝까지 내려갈 수 있도록 계속 하강!
          descendRate = GACHA_PHYSICS.CLAW_DESCEND_SPEED * 0.82;
        } else {
          state.leftProngAngle += (CLAW_OPEN_ANGLE - state.leftProngAngle) * Math.min(1, 6 * dt);
          state.rightProngAngle += (CLAW_OPEN_ANGLE - state.rightProngAngle) * Math.min(1, 6 * dt);
          state.clawTiltZ += (0 - state.clawTiltZ) * Math.min(1, 6 * dt);
        }

        state.clawY = Math.max(
          GACHA_PHYSICS.CLAW_DROP_Y,
          state.clawY - descendRate * dt
        );

        if (state.clawY <= GACHA_PHYSICS.CLAW_DROP_Y || stopDescend) {
          state.startLeftCloseAngle = state.leftProngAngle;
          state.startRightCloseAngle = state.rightProngAngle;

          // 닫힐 때 집게가 상자를 시각적으로 뚫지 않도록 좌/우 독립 닫힘 각도 산출
          let computedCloseAngle = 0.05;
          for (const ent of boxEntities.values()) {
            if (state.wonSet.has(ent.data.id)) continue;
            const dims = getBoxDimensions(ent.data.slotIndex);
            const dx = Math.abs(ent.body.position.x - state.clawX);
            const dz = Math.abs(ent.body.position.z - state.clawZ);
            if (dx <= dims.w / 2 + 0.42 && dz <= dims.d / 2 + 0.18) {
              const spanX = getBoxWorldSpanX(ent.body, dims);
              computedCloseAngle = Math.max(computedCloseAngle, getCloseAngleForSpan(spanX));
            }
          }

          if (state.bothBlockedOnTop) {
            state.targetLeftCloseAngle = Math.max(computedCloseAngle, CLAW_OPEN_ANGLE - 0.10);
            state.targetRightCloseAngle = Math.max(computedCloseAngle, CLAW_OPEN_ANGLE - 0.10);
          } else if (state.leftBlockedBoxId && !state.rightBlockedBoxId) {
            // 좌측은 상자 윗면 위에서 살짝 오므리고, 끝까지 내려간 우측은 상자 옆구리/아랫면을 깊게 감싸 집음
            state.targetLeftCloseAngle = Math.max(0.32, state.leftProngAngle - 0.22);
            state.targetRightCloseAngle = Math.min(0.10, computedCloseAngle);
          } else if (state.rightBlockedBoxId && !state.leftBlockedBoxId) {
            // 우측은 상자 윗면 위에서 살짝 오므리고, 끝까지 내려간 좌측은 상자 옆구리/아랫면을 깊게 감싸 집음
            state.targetLeftCloseAngle = Math.min(0.10, computedCloseAngle);
            state.targetRightCloseAngle = Math.max(0.32, state.rightProngAngle - 0.22);
          } else {
            state.targetLeftCloseAngle = computedCloseAngle;
            state.targetRightCloseAngle = computedCloseAngle;
          }

          state.phaseTimer = 0;
          setCranePhase('closing');
          playTone(state.bothBlockedOnTop ? 220 : 330, 0.1, 'square', 0.05);
        }
      } else if (curPhase === 'closing') {
        state.phaseTimer += dt;
        const progress = Math.min(1, state.phaseTimer / 0.44);
        state.leftProngAngle =
          state.startLeftCloseAngle -
          progress * (state.startLeftCloseAngle - state.targetLeftCloseAngle);
        state.rightProngAngle =
          state.startRightCloseAngle -
          progress * (state.startRightCloseAngle - state.targetRightCloseAngle);

        // 닫히는 0.44초 동안 상자 윗면에 닿아 있는 집게는 반발 없이 지그시 누르며
        // 한쪽 집게만 걸린 경우 집게가 안쪽으로 오므라들며 상자를 밀고 끌어당기는 실물 마찰 이동 효과 적용!
        if (state.bothBlockedOnTop || state.leftBlockedBoxId || state.rightBlockedBoxId) {
          clawGroup.position.set(state.clawX, state.clawY, state.clawZ);
          clawGroup.rotation.z = state.clawTiltZ;
          leftArmPivot.rotation.z = -state.leftProngAngle;
          rightArmPivot.rotation.z = state.rightProngAngle;
          clawGroup.updateMatrixWorld(true);

          const tipEntries: Array<{ tw: CANNON.Vec3; side: -1 | 1 }> = [];
          if (state.bothBlockedOnTop || state.leftBlockedBoxId) {
            const lv = leftTip.localToWorld(new THREE.Vector3(0, -0.18, 0));
            tipEntries.push({ tw: new CANNON.Vec3(lv.x, lv.y, lv.z), side: -1 });
          }
          if (state.bothBlockedOnTop || state.rightBlockedBoxId) {
            const rv = rightTip.localToWorld(new THREE.Vector3(0, -0.18, 0));
            tipEntries.push({ tw: new CANNON.Vec3(rv.x, rv.y, rv.z), side: 1 });
          }
          const isSingleSideBlocked =
            !state.bothBlockedOnTop && Boolean(state.leftBlockedBoxId) !== Boolean(state.rightBlockedBoxId);

          for (const ent of boxEntities.values()) {
            if (state.wonSet.has(ent.data.id)) continue;
            if (ent.data.id !== state.leftBlockedBoxId && ent.data.id !== state.rightBlockedBoxId) continue;
            const dims = getBoxDimensions(ent.data.slotIndex);
            for (const { tw, side } of tipEntries) {
              const loc = ent.body.pointToLocalFrame(tw);
              if (
                Math.abs(loc.x) <= dims.w / 2 + 0.08 &&
                Math.abs(loc.z) <= dims.d / 2 + 0.08 &&
                loc.y <= dims.h / 2 + 0.08 &&
                loc.y >= -dims.h / 2 - 0.06
              ) {
                const clampedLoc = new CANNON.Vec3(
                  Math.max(-dims.w / 2, Math.min(dims.w / 2, loc.x)),
                  Math.max(-dims.h / 2, Math.min(dims.h / 2, loc.y)),
                  Math.max(-dims.d / 2, Math.min(dims.d / 2, loc.z))
                );
                const relPt = ent.body.pointToWorldFrame(clampedLoc).vsub(ent.body.position);
                // 한쪽 집게가 안쪽으로 오므라들며 상자를 크레인 중심 쪽(-side 방향)으로 끌어당기거나 밀어냄
                const dragX = isSingleSideBlocked ? -side * 22 : 0;
                const nudgeZ = isSingleSideBlocked
                  ? -Math.sign(ent.body.position.z || 0.01) * 4.5
                  : 0;
                ent.body.applyForce(new CANNON.Vec3(dragX, -26, nudgeZ), relPt);
                if (ent.body.velocity.y > 0) ent.body.velocity.y = 0;
              }
            }
          }
        }

        if (progress >= 1) {
          // 실제 물리적 잡기 판정
          // - 양발 모두 상자 윗면에 막힘: 잡기 불가 (관통 금지)
          // - 한쪽만 걸리고 반대쪽은 끝까지 내려감: 안 걸린 쪽 집게로 옆구리/모서리를 비스듬히 후킹해 이상한 각도로 들어올려 위치 변화 유도!
          // - 양발 모두 깔끔히 감쌈: 정상 양발 잡기 (현실적인 아케이드 집게 힘 편차 적용)
          const pinchWorld = new CANNON.Vec3(state.clawX, state.clawY - 0.56, state.clawZ);
          let bestEnt: BoxEntity | null = null;
          let bestDist = 1.05;
          let bestLocal = new CANNON.Vec3(0, 0, 0);
          let bestDims = getBoxDimensions(0);

          for (const ent of boxEntities.values()) {
            if (state.wonSet.has(ent.data.id)) continue;
            const dims = getBoxDimensions(ent.data.slotIndex);
            const localPt = ent.body.pointToLocalFrame(pinchWorld);
            // 상자가 어떤 각도(가로 90도 포함)로 돌아가 있든 한쪽 집게가 끝 모서리에 걸릴 수 있도록 X/Z 양방향 여유 확보
            if (
              Math.abs(localPt.x) <= dims.w / 2 + 0.42 &&
              Math.abs(localPt.z) <= dims.d / 2 + 0.42 &&
              Math.abs(localPt.y) <= dims.h / 2 + 0.36
            ) {
              const d = pinchWorld.distanceTo(ent.body.position);
              if (d < bestDist) {
                bestDist = d;
                bestEnt = ent;
                bestDims = dims;
                bestLocal = new CANNON.Vec3(
                  Math.max(-dims.w * 0.42, Math.min(dims.w * 0.42, localPt.x)),
                  dims.h * 0.14,
                  Math.max(-dims.d * 0.44, Math.min(dims.d * 0.44, localPt.z))
                );
              }
            }
          }

          state.didSlipThisLift = false;
          state.isWeakGripThisTurn = false;
          state.grabSlipTime = 1.15;

          if (bestEnt) {
            const boxSpanX = getBoxWorldSpanX(bestEnt.body, bestDims);
            const boxTopY = bestEnt.body.position.y + getBoxWorldHalfHeight(bestEnt.body, bestDims);
            const tipY = state.clawY - CLAW_TIP_DROP_Y;
            const leftBlocked = state.leftBlockedBoxId === bestEnt.data.id;
            const rightBlocked = state.rightBlockedBoxId === bestEnt.data.id;
            const bothBlocked = state.bothBlockedOnTop || (leftBlocked && rightBlocked);
            const oneBlocked = (leftBlocked || rightBlocked) && !bothBlocked;
            const tooWideToStraddle = boxSpanX > CLAW_OPEN_SPAN - 0.05;
            const freeTipReachedSide = tipY < boxTopY - 0.08;

            // 회전 각도(0°/45°/90° 등)에 무관하게 실제로 집게 끝단이 닿는 상자 외곽 모서리 로컬 좌표 계산 헬퍼
            const computeWorldEdgeHookLocal = (sideSign: number) => {
              const tipWorld = new CANNON.Vec3(
                state.clawX + sideSign * 0.26,
                Math.max(bestEnt!.body.position.y - bestDims.h * 0.2, state.clawY - 0.56),
                state.clawZ
              );
              const loc = bestEnt!.body.pointToLocalFrame(tipWorld);
              return new CANNON.Vec3(
                Math.max(-bestDims.w * 0.46, Math.min(bestDims.w * 0.46, loc.x)),
                Math.max(-bestDims.h * 0.35, Math.min(bestDims.h * 0.3, loc.y)),
                Math.max(-bestDims.d * 0.46, Math.min(bestDims.d * 0.46, loc.z))
              );
            };

            // 반대쪽(안 막힌 쪽) 집게 끝단이 닫힘 스윕(0.18~0.54) 중 실제로 상자 옆면/아랫모서리에 닿는지 정밀 검증
            const freeSideSign = leftBlocked ? 1 : -1;
            const blockedSideSign = leftBlocked ? -1 : 1;
            let freeTipActuallyNearBox = false;
            for (const sweepDist of [0.18, 0.30, 0.42, 0.54]) {
              const checkPt = new CANNON.Vec3(
                state.clawX + freeSideSign * sweepDist,
                Math.max(bestEnt.body.position.y - bestDims.h * 0.28, state.clawY - 0.66),
                state.clawZ
              );
              const fLoc = bestEnt.body.pointToLocalFrame(checkPt);
              if (
                Math.abs(fLoc.x) <= bestDims.w / 2 + 0.22 &&
                Math.abs(fLoc.z) <= bestDims.d / 2 + 0.20
              ) {
                freeTipActuallyNearBox = true;
                break;
              }
            }

            if (bothBlocked) {
              // 양발 모두 상자 윗면에 닿아 부드럽게 누르기 완료
              if (bestEnt.body.velocity.y > 0) bestEnt.body.velocity.y = 0;
              setClawFeedback('👇 양쪽 집게로 상자 윗면을 지그시 눌렀습니다!');
              playTone(200, 0.13, 'sawtooth', 0.045);
            } else if (oneBlocked && !freeTipActuallyNearBox) {
              // 한쪽 집게가 상자 위/가운데를 찍고 반대쪽은 끝까지 파고든 상태:
              // 단순히 제자리에서 끝나지 않고, 걸린 집게가 상자를 안쪽(-blockedSideSign)으로 밀고 살짝 들어올렸다 놓아 실제 위치 변화·기울기 연출!
              const tugLocal = computeWorldEdgeHookLocal(blockedSideSign);
              const tugAnchorOffset = new CANNON.Vec3(blockedSideSign * 0.24, -0.52, 0);
              const tugForce = 15.0 + Math.random() * 3.0;
              state.grabSlipTime = 0.34 + Math.random() * 0.14;
              state.isWeakGripThisTurn = false;

              // 약간의 수평 밀기/끌어당김(반발 튀어오름 없이 수평 방향만 적용)
              const nudgeWorldPt = bestEnt.body.pointToWorldFrame(tugLocal);
              bestEnt.body.applyImpulse(
                new CANNON.Vec3(-blockedSideSign * 0.28, 0, -Math.sign(bestEnt.body.position.z || 0.01) * 0.08),
                nudgeWorldPt.vsub(bestEnt.body.position)
              );

              const constraint = new CANNON.PointToPointConstraint(
                clawAnchorBody,
                tugAnchorOffset,
                bestEnt.body,
                tugLocal,
                tugForce
              );
              world.addConstraint(constraint);
              state.grabConstraint = constraint;
              setClawFeedback('🪝 한쪽 집게가 상자를 밀어내며 살짝 들어올립니다!');
              playTone(260, 0.12, 'triangle', 0.05);
            } else if (oneBlocked && freeTipReachedSide && freeTipActuallyNearBox) {
              // 한쪽 집게는 상자 위를 누르고 반대쪽 집게가 상자 옆면/아래까지 파고들어 비스듬히 후킹!
              const hookLocal = computeWorldEdgeHookLocal(freeSideSign);
              const clawAnchorOffset = new CANNON.Vec3(freeSideSign * 0.24, -0.56, 0);
              const roll = Math.random();
              const isWeak = roll < 0.07; // 집게 힘 부족 확률 7% (10% 미만)
              state.isWeakGripThisTurn = isWeak;
              const hookForce = isWeak
                ? 13.5 + Math.random() * 2.0
                : roll < 0.70
                ? 19.5 + Math.random() * 3.2
                : 23.0 + Math.random() * 2.8;
              state.grabSlipTime = isWeak
                ? 0.34 + Math.random() * 0.14
                : roll < 0.70
                ? 0.66 + Math.random() * 0.24
                : 0.92 + Math.random() * 0.20;

              const constraint = new CANNON.PointToPointConstraint(
                clawAnchorBody,
                clawAnchorOffset,
                bestEnt.body,
                hookLocal,
                hookForce
              );
              world.addConstraint(constraint);
              state.grabConstraint = constraint;
              setClawFeedback('🪝 한쪽 집게가 옆모서리에 걸려 비스듬히 들어올립니다!');
            } else if (tooWideToStraddle && freeTipReachedSide) {
              // 상자가 가로/대각선으로 넓어 양쪽을 다 감싸진 못해도, 한쪽 집게가 상자 끝을 긁어 비스듬히 들어올림
              const sideSign = state.clawX >= bestEnt.body.position.x ? 1 : -1;
              const hookLocal = computeWorldEdgeHookLocal(sideSign);
              const clawAnchorOffset = new CANNON.Vec3(sideSign * 0.28, -0.56, 0);
              const roll = Math.random();
              const isWeak = roll < 0.07; // 7% (10% 미만)
              state.isWeakGripThisTurn = isWeak;
              const scrapeForce = isWeak ? 13.0 + Math.random() * 2.0 : 18.0 + Math.random() * 3.5;
              state.grabSlipTime = isWeak ? 0.30 + Math.random() * 0.14 : 0.56 + Math.random() * 0.26;

              const constraint = new CANNON.PointToPointConstraint(
                clawAnchorBody,
                clawAnchorOffset,
                bestEnt.body,
                hookLocal,
                scrapeForce
              );
              world.addConstraint(constraint);
              state.grabConstraint = constraint;
              setClawFeedback('🪝 집게가 넓은 상자 끝을 긁어 비스듬히 들어올립니다!');
            } else if (!freeTipReachedSide) {
              // 집게 끝단이 상자 옆면까지 내려오지 못한 경우에도 모서리를 밀어내며 약하게 들썩임
              const pushSign = state.clawX >= bestEnt.body.position.x ? -1 : 1;
              bestEnt.body.applyImpulse(
                new CANNON.Vec3(pushSign * 0.24, 0, 0.06),
                pinchWorld.vsub(bestEnt.body.position)
              );
              if (bestEnt.body.velocity.y > 0) bestEnt.body.velocity.y = 0;
              setClawFeedback('👆 집게가 상자 모서리를 밀어냈습니다!');
              playTone(210, 0.12, 'triangle', 0.04);
            } else {
              // 정상 양발 잡기! 집게 힘 부족(조기 미끄러짐) 확률 7% (10% 미만)로 축소
              const centerOffsetX = Math.abs(bestEnt.body.position.x - state.clawX);
              const offCenterPenalty = Math.min(3.0, centerOffsetX * 6.0);
              const roll = Math.random();
              const isWeak = roll < 0.07; // 약 7% (< 10%)
              state.isWeakGripThisTurn = isWeak;
              let gripForce: number;
              let slipAt: number;

              if (isWeak) {
                // 약 7%: 집게 힘이 부족한 상태 (조금 들리다 일찍 미끄러짐)
                gripForce = Math.max(12.5, 14.5 + Math.random() * 2.5 - offCenterPenalty * 0.5);
                slipAt = 0.30 + Math.random() * 0.18;
              } else if (roll < 0.72) {
                // 약 65%: 안정적인 표준 아케이드 집게 힘 (탄탄하게 들어올린 뒤 자연 낙하)
                gripForce = Math.max(18.5, 22.0 + Math.random() * 3.0 - offCenterPenalty);
                slipAt = 0.74 + Math.random() * 0.24;
              } else {
                // 약 28%: 힘 좋은 집게 (높이까지 단단히 들어올림)
                gripForce = Math.max(23.5, 26.5 + Math.random() * 2.5 - offCenterPenalty * 0.5);
                slipAt = 0.98 + Math.random() * 0.18;
              }

              state.grabSlipTime = slipAt;
              const constraint = new CANNON.PointToPointConstraint(
                clawAnchorBody,
                new CANNON.Vec3(0, -0.56, 0),
                bestEnt.body,
                bestLocal,
                gripForce
              );
              world.addConstraint(constraint);
              state.grabConstraint = constraint;
            }
          }

          if (bestEnt) {
            state.disturbedBoxIds.add(bestEnt.data.id);
          }

          const targetIsInitialState = bestEnt ? isBoxAtInitialPose(bestEnt.data) : false;
          const boardIsInitialState = bestEnt
            ? targetIsInitialState
            : Array.from(boxEntities.values()).some(
                (e) => !state.wonSet.has(e.data.id) && isBoxAtInitialPose(e.data)
              );

          // 1) 재정렬/초기화 원위치(초기 세팅) 상태일 때:
          //    - 상품 정중앙 근처를 들어올리면 'Balance Catch!' 팝업 + /gacha/bc.mp3 재생
          //    - 초기 세팅 상태에서는 Bar 근처를 집어 들어올려도 '극한 드르륵!'은 발동하지 않음
          if (state.grabConstraint && bestEnt && targetIsInitialState && !state.balanceCatchTriggeredThisTurn) {
            const centerDx = Math.abs(state.clawX - bestEnt.data.position[0]);
            const centerDz = Math.abs(state.clawZ - bestEnt.data.position[2]);
            const maxCenterDx = Math.max(0.20, bestDims.w * 0.30);
            const maxCenterDz = Math.min(0.24, Math.max(0.20, bestDims.d * 0.16));
            if (centerDx <= maxCenterDx && centerDz <= maxCenterDz) {
              state.balanceCatchTriggeredThisTurn = true;
              triggerBalanceCatch();
            }
          }

          // 2) 초기 상태가 아닐 때:
          //    - 중앙 빨간 Bar(z = ±0.455) 근처(위/아래 포함, 외곽 Bar 제외)에서 집게를 들어올릴 때
          //      '극한 드르륵!' 팝업(1초) + /gacha/drr.mp3 재생
          //    - 반대로 초기 상태가 아닌 경우 정중앙 근처를 들어올려도 Balance Catch!는 발동하지 않음
          if (!boardIsInitialState) {
            if (!state.passedBarGapCleanly) {
              for (const bar of allBarSpecs) {
                if (bar.isOuter) continue;
                if (Math.abs(state.clawZ - bar.z) <= 0.28) {
                  state.passedBarGapCleanly = true;
                  break;
                }
              }
            }
            if (state.grabConstraint && state.passedBarGapCleanly && !state.drrTriggeredThisTurn) {
              state.drrTriggeredThisTurn = true;
              triggerExtremeDrr();
            }
          }

          state.phaseTimer = 0;
          setCranePhase('lifting');
          playTone(587.33, 0.12);
        }
      } else if (curPhase === 'lifting') {
        state.phaseTimer += dt;
        state.clawY = Math.min(GACHA_PHYSICS.CLAW_LIFT_Y, state.clawY + 1.35 * dt);
        state.clawTiltZ += (0 - state.clawTiltZ) * Math.min(1, 3.5 * dt);
        // 들어올리면서 미세하게 앞(Z+) 또는 중앙으로 끌어당겨 브릿지 탈출/기울기 유도
        if (state.phaseTimer > 0.25 && state.phaseTimer < 0.75) {
          state.clawZ = Math.min(GACHA_PHYSICS.CLAW_MAX_Z, state.clawZ + 0.18 * dt);
        }

        // 들어올리는 도중 지정 시점에 그립 해제 (실제 힘 부족 메시지는 10% 미만 확률일 때만 표시!)
        if (state.grabConstraint && state.phaseTimer >= state.grabSlipTime) {
          world.removeConstraint(state.grabConstraint);
          state.grabConstraint = null;
          if (!state.didSlipThisLift) {
            state.didSlipThisLift = true;
            state.leftProngAngle = Math.min(CLAW_OPEN_ANGLE, state.leftProngAngle + 0.12);
            state.rightProngAngle = Math.min(CLAW_OPEN_ANGLE, state.rightProngAngle + 0.12);
            if (state.isWeakGripThisTurn) {
              setClawFeedback('💨 집게 힘이 부족해 들어올리다 미끄러졌습니다!');
              playTone(250, 0.13, 'triangle', 0.06);
            }
          }
        }

        if (state.clawY >= GACHA_PHYSICS.CLAW_LIFT_Y || state.phaseTimer >= 1.15) {
          if (state.grabConstraint) {
            world.removeConstraint(state.grabConstraint);
            state.grabConstraint = null;
          }
          state.phaseTimer = 0;
          setCranePhase('releasing');
          playTone(392, 0.1);
        }
      } else if (curPhase === 'releasing') {
        state.phaseTimer += dt;
        state.leftProngAngle = Math.min(CLAW_OPEN_ANGLE, state.leftProngAngle + 1.6 * dt);
        state.rightProngAngle = Math.min(CLAW_OPEN_ANGLE, state.rightProngAngle + 1.6 * dt);
        state.clawTiltZ += (0 - state.clawTiltZ) * Math.min(1, 6 * dt);
        // 집게 홈 복귀
        state.clawX += (GACHA_PHYSICS.CLAW_HOME_X - state.clawX) * Math.min(1, 3.2 * dt);
        state.clawZ += (GACHA_PHYSICS.CLAW_HOME_Z - state.clawZ) * Math.min(1, 3.2 * dt);
        state.clawY += (GACHA_PHYSICS.CLAW_HOME_Y - state.clawY) * Math.min(1, 3.2 * dt);

        if (state.phaseTimer >= 0.5) {
          state.phaseTimer = 0;
          state.settleQuietTime = 0;
          setCranePhase('settling');
        }
      } else if (curPhase === 'settling') {
        state.phaseTimer += dt;
        state.clawX += (GACHA_PHYSICS.CLAW_HOME_X - state.clawX) * Math.min(1, 4 * dt);
        state.clawZ += (GACHA_PHYSICS.CLAW_HOME_Z - state.clawZ) * Math.min(1, 4 * dt);
        state.clawY += (GACHA_PHYSICS.CLAW_HOME_Y - state.clawY) * Math.min(1, 4 * dt);

        let allQuiet = true;
        for (const ent of boxEntities.values()) {
          if (state.wonSet.has(ent.data.id)) continue;
          const v = ent.body.velocity.length();
          const av = ent.body.angularVelocity.length();
          if (v > 0.06 || av > 0.08) {
            allQuiet = false;
            break;
          }
        }
        if (allQuiet) {
          state.settleQuietTime += dt;
        } else {
          state.settleQuietTime = 0;
        }

        if (state.settleQuietTime >= 0.55 || state.phaseTimer >= 4.0) {
          finishTurn();
        }
      }

      // 활성 물리 스텝 진행 (하강 ~ 안정화 단계)
      const isPhysicsActive =
        curPhase === 'descending' ||
        curPhase === 'closing' ||
        curPhase === 'lifting' ||
        curPhase === 'releasing' ||
        curPhase === 'settling';

      if (isPhysicsActive) {
        clawAnchorBody.position.set(state.clawX, state.clawY, state.clawZ);
        clawHeadCollider.position.set(state.clawX, state.clawY + 0.08, state.clawZ);
        world.step(1 / 120, dt, 6);

        // 탱탱볼 튀어오름 완전 억제 속도 제한 & 3D 메시 동기화 & 낙하 승리 감지
        for (const ent of boxEntities.values()) {
          if (!state.wonSet.has(ent.data.id)) {
            if (!state.grabConstraint) {
              // 잡혀 있지 않을 때는 바/집게 충돌로 위로 튀어오르는 속도 강제 감쇠
              if (ent.body.velocity.y > 0.10) {
                ent.body.velocity.y *= 0.30;
              }
              if (ent.body.velocity.y > 0.18) {
                ent.body.velocity.y = 0.18;
              }
              const horizSpeed = Math.hypot(ent.body.velocity.x, ent.body.velocity.z);
              if (horizSpeed > 1.8) {
                const s = 1.8 / horizSpeed;
                ent.body.velocity.x *= s;
                ent.body.velocity.z *= s;
              }
              const angSpeed = ent.body.angularVelocity.length();
              if (angSpeed > 3.6) {
                ent.body.angularVelocity.scale(3.6 / angSpeed, ent.body.angularVelocity);
              }
            } else {
              if (ent.body.velocity.y > 1.55) {
                ent.body.velocity.y = 1.55;
              }
              const angSpeed = ent.body.angularVelocity.length();
              if (angSpeed > 4.2) {
                ent.body.angularVelocity.scale(4.2 / angSpeed, ent.body.angularVelocity);
              }
            }
          }

          ent.mesh.position.set(ent.body.position.x, ent.body.position.y, ent.body.position.z);
          ent.mesh.quaternion.set(
            ent.body.quaternion.x,
            ent.body.quaternion.y,
            ent.body.quaternion.z,
            ent.body.quaternion.w
          );

          if (!state.wonSet.has(ent.data.id) && ent.body.position.y < GACHA_PHYSICS.DROP_Y_THRESHOLD) {
            state.wonSet.add(ent.data.id);
            setDroppedThisTurn(state.wonSet.size);
            playTone(783.99, 0.14, 'sine', 0.12);
            setTimeout(() => playTone(1046.5, 0.25, 'sine', 0.12), 110);
          }
        }
      }

      // 와이어 진자 흔들림(관성 스웨이) 업데이트 — 크레인 이동/정지 시 현실감 있는 미세 흔들림
      const vxClaw = dt > 1e-4 ? (state.clawX - prevClawX) / dt : 0;
      const vzClaw = dt > 1e-4 ? (state.clawZ - prevClawZ) / dt : 0;
      const targetSwayX = Math.max(-0.11, Math.min(0.11, -vxClaw * 0.08));
      const targetSwayZ = Math.max(-0.10, Math.min(0.10, vzClaw * 0.08));
      const springK = 26;
      const dampC = 6.2;
      state.clawSwayVelX += ((targetSwayX - state.clawSwayX) * springK - state.clawSwayVelX * dampC) * dt;
      state.clawSwayVelZ += ((targetSwayZ - state.clawSwayZ) * springK - state.clawSwayVelZ * dampC) * dt;
      state.clawSwayX += state.clawSwayVelX * dt;
      state.clawSwayZ += state.clawSwayVelZ * dt;

      // 크레인, 갠트리, 와이어, 조준 레이저 위치 업데이트 (좌/우 집게 독립 각도 + UFO 기울기 + 관성 스웨이 반영)
      clawGroup.position.set(state.clawX, state.clawY, state.clawZ);
      clawGroup.rotation.z = state.clawTiltZ + state.clawSwayX;
      clawGroup.rotation.x = state.clawSwayZ;
      leftArmPivot.rotation.z = -state.leftProngAngle;
      rightArmPivot.rotation.z = state.rightProngAngle;
      gantryBeam.position.z = state.clawZ;

      const cableLen = Math.max(0.1, 3.25 - state.clawY);
      cableMesh.scale.y = cableLen;
      cableMesh.position.set(state.clawX, state.clawY + cableLen / 2 + 0.12, state.clawZ);

      const showAim =
        curPhase === 'ready_right' ||
        curPhase === 'moving_right' ||
        curPhase === 'ready_up' ||
        curPhase === 'moving_up';
      aimRing.visible = showAim;
      aimBeam.visible = showAim;
      if (showAim) {
        aimRing.position.set(state.clawX, GACHA_PHYSICS.BAR_Y + 0.12, state.clawZ);
        const beamH = Math.max(0.2, state.clawY - (GACHA_PHYSICS.BAR_Y + 0.12));
        aimBeam.scale.y = beamH / 1.7;
        aimBeam.position.set(state.clawX, GACHA_PHYSICS.BAR_Y + 0.12 + beamH / 2, state.clawZ);
      }

      // 카메라 시점(정면/까치발/항공/우측) 부드러운 보간 이동
      const desiredPose = getCameraPose(
        cameraViewRef.current,
        viewportW,
        viewportH,
        frontTiptoeDegRef.current
      );
      const lerpAlpha = Math.min(1, dt * 8.5);
      camera.position.lerp(desiredPose.pos, lerpAlpha);
      currentLookAt.lerp(desiredPose.look, lerpAlpha);
      camera.lookAt(currentLookAt);

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 460;
      applyResponsiveCamera(w, h, false);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [playTone, setCranePhase, triggerExtremeDrr, triggerBalanceCatch]);

  const isCraneLockedToFront = isMyTurn || isFinishing || phase !== 'idle';

  // 조작 버튼 핸들러 (1회성 누르고 떼기 - 정면뷰에서만 조작 가능)
  const handleRightPressStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (cameraViewRef.current !== 'front') {
      setCameraView('front');
      cameraViewRef.current = 'front';
      return;
    }
    if (phaseRef.current === 'ready_right') {
      setCranePhase('moving_right');
      playTone(350, 0.06);
    }
  };

  const handleRightPressEnd = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (phaseRef.current === 'moving_right') {
      setCranePhase('ready_up');
      playTone(520, 0.08);
    }
  };

  const handleUpPressStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (cameraViewRef.current !== 'front') {
      setCameraView('front');
      cameraViewRef.current = 'front';
      return;
    }
    if (phaseRef.current === 'ready_up') {
      setCranePhase('moving_up');
      playTone(420, 0.06);
    }
  };

  const handleUpPressEnd = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (phaseRef.current === 'moving_up') {
      if (simControlRef.current) {
        simControlRef.current.phaseTimer = 0;
      }
      setCranePhase('descending');
      playTone(640, 0.12);
    }
  };

  // 키보드 방향키(→, ↑) 지원 (정면뷰에서만 조작 가능)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && phaseRef.current === 'ready_right') {
        e.preventDefault();
        if (cameraViewRef.current !== 'front') {
          setCameraView('front');
          cameraViewRef.current = 'front';
          return;
        }
        setCranePhase('moving_right');
        playTone(350, 0.06);
      } else if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && phaseRef.current === 'ready_up') {
        e.preventDefault();
        if (cameraViewRef.current !== 'front') {
          setCameraView('front');
          cameraViewRef.current = 'front';
          return;
        }
        setCranePhase('moving_up');
        playTone(420, 0.06);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && phaseRef.current === 'moving_right') {
        e.preventDefault();
        setCranePhase('ready_up');
        playTone(520, 0.08);
      } else if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && phaseRef.current === 'moving_up') {
        e.preventDefault();
        if (simControlRef.current) simControlRef.current.phaseTimer = 0;
        setCranePhase('descending');
        playTone(640, 0.12);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [playTone, setCranePhase]);

  const phaseBannerText = (() => {
    if (lockedByOther) return `🔒 현재 ${lockedByOther}님이 크레인을 조작 중입니다...`;
    switch (phase) {
      case 'idle':
        return '하단 [뽑기 시작]을 눌러 UFO 브릿지 크레인을 조작하세요!';
      case 'ready_right':
        return '1단계: [➡ 우측 이동] 버튼을 꾹 눌렀다가 원하는 X 위치에서 떼세요!';
      case 'moving_right':
        return '➡ 오른쪽으로 이동 중... 손을 떼면 X 좌표가 고정됩니다!';
      case 'ready_up':
        return '2단계: [⬆ 안쪽(위) 이동] 버튼을 꾹 눌렀다가 원하는 Z 위치에서 떼세요!';
      case 'moving_up':
        return '⬆ 안쪽으로 이동 중... 손을 떼면 즉시 하강하여 집게가 작동합니다!';
      case 'descending':
        return '⬇ 크레인이 하강하고 있습니다...';
      case 'closing':
        return '🤏 집게로 상자를 잡는 중...';
      case 'lifting':
        return clawFeedback || '⬆ 상자를 들어올리고 있습니다!';
      case 'releasing':
      case 'settling':
        return droppedThisTurn > 0
          ? '🎉 Bar 사이로 상자가 떨어졌습니다!! 결과 확인 중...'
          : clawFeedback || '⚖️ 상자가 Bar 위에서 흔들리며 자리를 잡는 중...';
    }
  })();

  return (
    <div className="w-full rounded-3xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl shadow-cyan-950/30">
      {/* 상단 상태 바 */}
      <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-black shrink-0">
              <Sparkles className="w-3 h-3" />
              {machineIndex + 1}/{machineCount}번 판
            </span>
            <span className="text-xs font-black text-amber-300 shrink-0 hidden sm:inline">
              {machineLabel}
            </span>
            <span className="text-xs font-bold text-slate-200 truncate">{phaseBannerText}</span>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer shrink-0"
            title={soundEnabled ? '효과음 끄기' : '효과음 켜기'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>

        {/* 개별 뽑기판 빠른 전환 탭 (#1 ~ #6) + 우측 관리자 전용 개별 리필/초기화 버튼 */}
        {machineSummaries.length > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {machineSummaries.map((ms) => {
                const isActive = ms.index === machineIndex;
                return (
                  <button
                    key={ms.index}
                    type="button"
                    disabled={isCraneLockedToFront}
                    onClick={() => onSelectMachine?.(ms.index)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold shrink-0 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                        : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ms.lockedBy
                          ? 'bg-rose-400 animate-pulse'
                          : ms.hasStock
                          ? 'bg-emerald-400'
                          : 'bg-slate-600'
                      }`}
                    />
                    <span>{ms.shortName}</span>
                    {!ms.hasStock && (
                      <span className="text-[9px] text-rose-400 font-black">품절</span>
                    )}
                  </button>
                );
              })}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={onAdminRefill}
                  disabled={isRefilling || isResetting || isCraneLockedToFront}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-[11px] font-black cursor-pointer disabled:opacity-45 transition-colors"
                  title={`현재 선택된 ${machineLabel} 뽑기판 리필`}
                >
                  {isRefilling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PackagePlus className="w-3.5 h-3.5" />
                  )}
                  <span>뽑기판 리필</span>
                </button>

                <button
                  type="button"
                  onClick={onAdminReset}
                  disabled={isResetting || isRefilling || isCraneLockedToFront}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-[11px] font-black cursor-pointer disabled:opacity-45 transition-colors"
                  title={`현재 선택된 ${machineLabel} 뽑기판 중앙 정위치 초기화`}
                >
                  {isResetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>뽑기판 초기화</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3D WebGL 캔버스 뷰포트 */}
      <div className="relative w-full h-[280px] sm:h-[440px] bg-[#070b18] select-none">
        <div ref={mountRef} className="w-full h-full" />

        {/* 좌측 상단 현재 카메라 시점 표시 (클릭 시 기본 정면뷰 0° 복귀) */}
        <button
          type="button"
          onClick={() => {
            setCameraView('front');
            setFrontTiptoeDeg(0);
          }}
          className={`absolute top-2.5 left-2.5 z-20 inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] sm:text-[11px] font-bold backdrop-blur-sm transition-all cursor-pointer ${
            cameraView === 'front' && frontTiptoeDeg === 0
              ? 'bg-slate-900/75 border-slate-700/80 text-slate-300'
              : 'bg-cyan-950/85 border-cyan-400/60 text-cyan-200 hover:bg-cyan-900/85'
          }`}
          title="기본 정면 뷰(0°)로 복귀"
        >
          <Camera className="w-3 h-3 text-cyan-400" />
          <span>
            {cameraView === 'front'
              ? frontTiptoeDeg > 0
                ? `까치발 +${frontTiptoeDeg}°`
                : isCraneLockedToFront
                ? '정면뷰 (조작 고정)'
                : '정면뷰'
              : cameraView === 'top'
              ? '항공뷰 · 정면복귀'
              : '우측뷰 · 정면복귀'}
          </span>
        </button>

        {/* 상단 중앙 컨트롤: [항공뷰] + 옆에 [까치발 업/다운 (0°~45°, 조작 중에도 사용 가능)] */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
          {!isCraneLockedToFront && (
            <button
              type="button"
              onClick={() => setCameraView((prev) => (prev === 'top' ? 'front' : 'top'))}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-black backdrop-blur-sm shadow-md transition-all active:scale-95 cursor-pointer ${
                cameraView === 'top'
                  ? 'bg-cyan-500/90 border-cyan-300 text-slate-950'
                  : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-600/80 text-slate-200 hover:text-cyan-300'
              }`}
              title={cameraView === 'top' ? '정면 뷰로 돌아가기' : '항공 뷰 (위에서 보기 · 조작 불가)'}
            >
              {cameraView === 'top' ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>정면뷰</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>항공뷰</span>
                </>
              )}
            </button>
          )}

          {/* 정면 까치발 업/다운 버튼 (최대 45°까지 상향 시점 조절 · 이 상태에서도 크레인 조작 가능!) */}
          {cameraView === 'front' && (
            <div
              className="inline-flex items-center rounded-full border border-emerald-500/50 bg-slate-900/85 backdrop-blur-sm shadow-md overflow-hidden"
              title="까치발 시점 조절 (최대 45° · 뽑기 조작 가능)"
            >
              <button
                type="button"
                disabled={frontTiptoeDeg >= 45}
                onClick={() => setFrontTiptoeDeg((d) => Math.min(45, d + 15))}
                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] sm:text-xs font-black text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="까치발 올리기 (+15°, 최대 45°)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>업</span>
              </button>
              <span className="px-1.5 text-[10px] sm:text-[11px] font-mono font-black text-white border-x border-slate-700/80 select-none">
                {frontTiptoeDeg}°
              </span>
              <button
                type="button"
                disabled={frontTiptoeDeg <= 0}
                onClick={() => setFrontTiptoeDeg((d) => Math.max(0, d - 15))}
                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] sm:text-xs font-black text-amber-300 hover:bg-amber-500/20 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="까치발 내리기 (-15°, 기본 0°)"
              >
                <span>다운</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 우측 중앙 작은 오른 화살표 버튼: 우측뷰 ↔ 정면뷰 전환 (크레인 조작 중 비활성) */}
        {!isCraneLockedToFront && (
          <button
            type="button"
            onClick={() => setCameraView((prev) => (prev === 'right' ? 'front' : 'right'))}
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 inline-flex flex-col items-center justify-center px-1.5 py-2 rounded-2xl border text-[10px] font-black backdrop-blur-sm shadow-md transition-all active:scale-95 cursor-pointer gap-0.5 ${
              cameraView === 'right'
                ? 'bg-amber-500/90 border-amber-300 text-slate-950'
                : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-600/80 text-slate-200 hover:text-amber-300'
            }`}
            title={cameraView === 'right' ? '정면 뷰로 돌아가기' : '우측 뷰 (오른쪽에서 보기 · 조작 불가)'}
          >
            {cameraView === 'right' ? (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="leading-none">정면</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="leading-none">우측</span>
              </>
            )}
          </button>
        )}

        {/* Bar 사이 낙하 안내 뱃지 */}
        <div className="absolute bottom-2.5 left-2.5 pointer-events-none px-2.5 py-1 rounded-lg bg-emerald-950/85 border border-emerald-500/40 text-[10px] sm:text-xs font-bold text-emerald-300 backdrop-blur-sm">
          🎯 <strong className="text-white">{machineLabel}</strong> ({machineDifficulty}) · 통과 시{' '}
          <span className="text-amber-300 font-mono">{machineRewardSol} SOL</span> 당첨!
        </div>

        {droppedThisTurn > 0 && (
          <div className="absolute top-11 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg animate-bounce">
            🎊 통과 성공!! 상자 획득!
          </div>
        )}

        {/* 극한 드르륵! 팝업 (초기 상태 이후 중앙 빨간 Bar 근처 리프트 시 1초간 노출 + /gacha/drr.mp3 재생) */}
        {showExtremeDrr && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 border-2 border-yellow-200 text-white font-black text-xl sm:text-3xl tracking-tight shadow-[0_0_40px_rgba(249,115,22,0.85)] animate-bounce">
              ⚡ 극한 드르륵! ⚡
            </div>
          </div>
        )}

        {/* Balance Catch! 팝업 (초기 원위치 세팅 상태에서 상품 정중앙 근처 리프트 시 노출 + /gacha/bc.mp3 재생) */}
        {showBalanceCatch && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-emerald-500 to-teal-500 border-2 border-cyan-100 text-white font-black text-xl sm:text-3xl tracking-tight shadow-[0_0_40px_rgba(16,185,129,0.85)] animate-bounce">
              ⚖️ Balance Catch!
            </div>
          </div>
        )}

        {/* 연속 뽑기 진행 회차 뱃지 */}
        {isMyTurn && sessionProgress && sessionProgress.total > 1 && (
          <div className="absolute top-2.5 right-2.5 pointer-events-none px-3 py-1 rounded-xl bg-indigo-950/90 border border-cyan-400/50 text-xs font-black text-cyan-200 shadow-lg backdrop-blur-sm flex items-center gap-1.5">
            <span>
              🔥 연속 뽑기 {sessionProgress.current} / {sessionProgress.total}회
            </span>
            {sessionProgress.bonusPlays > 0 &&
              sessionProgress.current > sessionProgress.total - sessionProgress.bonusPlays && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black">
                  🎁 무료 보너스!
                </span>
              )}
          </div>
        )}

        {/* 다른 멤버가 뽑기 진행 중일 때 동시 진행 방지 안내 오버레이 */}
        {lockedByOther && !isMyTurn && (
          <div className="absolute inset-0 z-10 bg-slate-950/45 backdrop-blur-[1.5px] flex items-center justify-center p-4 pointer-events-auto">
            <div className="px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-rose-500/60 shadow-2xl text-center space-y-1 max-w-xs">
              <div className="inline-flex items-center gap-1.5 text-rose-300 text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                <span>
                  {otherSessionProgress && otherSessionProgress.total > 1
                    ? `연속 뽑기 진행 중 (${otherSessionProgress.current}/${otherSessionProgress.total}회)`
                    : '현재 뽑기 진행 중'}
                </span>
              </div>
              <p className="text-sm font-black text-white">
                🔒 <span className="text-amber-300">{lockedByOther}</span>님이 뽑기를 진행 중입니다
              </p>
              <p className="text-[11px] text-slate-400">
                완료 후 상자 위치가 반영되면 바로 참여할 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 아케이드 조작 패널 */}
      <div className="p-4 bg-gradient-to-b from-slate-900 to-slate-950 border-t border-slate-800">
        {phase === 'idle' ? (
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-300 text-center md:text-left space-y-0.5">
              <div>
                선택된 플레이어: <strong className="text-amber-400">{selectedMember}</strong>{' '}
                <span className="text-slate-400">(보유 뽑기권 {selectedMemberTickets}장)</span>
              </div>
              <div className="text-[11px] text-cyan-300 font-bold">
                현재 뽑기판 [{machineIndex + 1}/{machineCount}]:{' '}
                <span className="text-white">{machineLabel}</span> · {machineDifficulty} ·{' '}
                <span className="text-amber-300 font-mono">{machineRewardSol} SOL</span>
              </div>
            </div>

            {/* 이전 뽑기 / 뽑기 시작 / 다음 뽑기 버튼 라인 */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-center">
              <button
                type="button"
                disabled={isCraneLockedToFront || isStarting}
                onClick={onPrevMachine}
                className="inline-flex items-center justify-center gap-1 px-3.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 hover:border-cyan-400/60 text-slate-200 hover:text-cyan-200 font-black text-xs sm:text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                title="이전 뽑기판으로 이동"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>이전 뽑기</span>
              </button>

              <button
                type="button"
                disabled={!canStartTurn || isStarting || isFinishing || !!lockedByOther || items.length === 0}
                onClick={() => {
                  if (cameraViewRef.current !== 'front') {
                    setCameraView('front');
                    cameraViewRef.current = 'front';
                  }
                  onStartTurnRequest?.();
                }}
                className="flex-1 md:flex-none px-5 sm:px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-orange-500/25 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {isFinishing
                  ? '💾 위치 저장 중...'
                  : isStarting
                  ? '크레인 준비 중...'
                  : lockedByOther
                  ? `🔒 ${lockedByOther}님 진행 중...`
                  : items.length === 0
                  ? '📦 품절 (리필 대기)'
                  : selectedMemberTickets < 1
                  ? '뽑기권 부족'
                  : '🕹️ 뽑기 시작!'}
              </button>

              <button
                type="button"
                disabled={isCraneLockedToFront || isStarting}
                onClick={onNextMachine}
                className="inline-flex items-center justify-center gap-1 px-3.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 hover:border-cyan-400/60 text-slate-200 hover:text-cyan-200 font-black text-xs sm:text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                title="다음 뽑기판으로 이동"
              >
                <span>다음 뽑기</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
            {/* 1. 우측 이동 버튼 */}
            <button
              type="button"
              onMouseDown={handleRightPressStart}
              onMouseUp={handleRightPressEnd}
              onMouseLeave={handleRightPressEnd}
              onTouchStart={handleRightPressStart}
              onTouchEnd={handleRightPressEnd}
              onTouchCancel={handleRightPressEnd}
              onContextMenu={(e) => e.preventDefault()}
              disabled={phase !== 'ready_right' && phase !== 'moving_right'}
              style={{ touchAction: 'none' }}
              className={`py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex flex-col items-center justify-center gap-1 border-2 select-none transition-all ${
                phase === 'moving_right'
                  ? 'bg-cyan-400 text-slate-950 border-white scale-95 shadow-lg shadow-cyan-500/40 cursor-pointer'
                  : phase === 'ready_right'
                  ? 'bg-gradient-to-b from-cyan-500 to-blue-600 text-white border-cyan-300 shadow-lg shadow-cyan-500/25 hover:brightness-110 cursor-pointer animate-pulse'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
            >
              <ArrowRight className="w-6 h-6 stroke-[3]" />
              <span>1. 우(→) 이동</span>
              <span className="text-[10px] font-medium opacity-85">
                {phase === 'moving_right' ? '손 떼면 정지!' : phase === 'ready_right' ? '꾹 누르고 있기 (→)' : '완료'}
              </span>
            </button>

            {/* 2. 위(안쪽) 이동 버튼 */}
            <button
              type="button"
              onMouseDown={handleUpPressStart}
              onMouseUp={handleUpPressEnd}
              onMouseLeave={handleUpPressEnd}
              onTouchStart={handleUpPressStart}
              onTouchEnd={handleUpPressEnd}
              onTouchCancel={handleUpPressEnd}
              onContextMenu={(e) => e.preventDefault()}
              disabled={phase !== 'ready_up' && phase !== 'moving_up'}
              style={{ touchAction: 'none' }}
              className={`py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex flex-col items-center justify-center gap-1 border-2 select-none transition-all ${
                phase === 'moving_up'
                  ? 'bg-amber-400 text-slate-950 border-white scale-95 shadow-lg shadow-amber-500/40 cursor-pointer'
                  : phase === 'ready_up'
                  ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/25 hover:brightness-110 cursor-pointer animate-pulse'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
            >
              <ArrowUp className="w-6 h-6 stroke-[3]" />
              <span>2. 위(↑) 이동</span>
              <span className="text-[10px] font-medium opacity-85">
                {phase === 'moving_up' ? '손 떼면 즉시 하강!' : phase === 'ready_up' ? '꾹 누르고 있기 (↑)' : '대기 중'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
