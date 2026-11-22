'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArrowRight, ArrowUp, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { GachaBoxItem } from '@/types/gacha';
import { GACHA_PHYSICS } from '@/constants/gacha';

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
}

function createSidePanelTexture(title: string, accent: string, bg: string): THREE.CanvasTexture {
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
    ctx.fillText('AIAL PRIZE · 0.01 SOL', 128, 88);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFigureFrontTexture(slotIndex: number, label: string): THREE.CanvasTexture {
  const isFrieren = slotIndex % 2 === 0;
  const imgSrc = isFrieren ? '/gacha/frieren.png' : '/gacha/nezuko.png';
  const accent = isFrieren ? '#bae6fd' : '#fbcfe8';
  const bg = isFrieren ? '#0369a1' : '#be123c';
  const title = isFrieren ? 'FRIEREN' : 'NEZUKO';

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const drawArtwork = (loadedImg?: HTMLImageElement) => {
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 512);

    if (loadedImg && loadedImg.width > 0 && loadedImg.height > 0) {
      // 비율 유지 Cover 크롭으로 캐릭터 이미지 채우기
      const targetAspect = 256 / 512;
      const srcAspect = loadedImg.width / loadedImg.height;
      let sx = 0, sy = 0, sw = loadedImg.width, sh = loadedImg.height;
      if (srcAspect > targetAspect) {
        sw = loadedImg.height * targetAspect;
        sx = (loadedImg.width - sw) / 2;
      } else {
        sh = loadedImg.width / targetAspect;
        sy = (loadedImg.height - sh) * 0.2;
      }
      ctx.drawImage(loadedImg, sx, sy, sw, sh, 8, 8, 240, 496);
    }

    // 피규어 박스 하단 타이틀 배너
    ctx.fillStyle = 'rgba(7, 11, 24, 0.82)';
    ctx.fillRect(8, 434, 240, 70);

    ctx.fillStyle = accent;
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 128, 458);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`${label} · 0.01 SOL`, 128, 486);

    // 피규어 박스 테두리 프레임
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 502);

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
  const isFrieren = slotIndex % 2 === 0;
  const accent = isFrieren ? '#7dd3fc' : '#f9a8d4';
  const bg = isFrieren ? '#0c4a6e' : '#881337';
  const title = isFrieren ? 'FRIEREN' : 'NEZUKO';

  const frontTex = createFigureFrontTexture(slotIndex, label);
  const sideTex = createSidePanelTexture(title, accent, bg);

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
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<CranePhase>('idle');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [droppedThisTurn, setDroppedThisTurn] = useState<number>(0);

  // Refs for animation loop access without re-creating Three.js scene
  const phaseRef = useRef<CranePhase>('idle');
  const soundEnabledRef = useRef<boolean>(true);
  const itemsRef = useRef<GachaBoxItem[]>(items);
  const onTurnFinishRef = useRef(onTurnFinish);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

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
    prongAngle: number;
    phaseTimer: number;
    settleQuietTime: number;
    wonSet: Set<string>;
    grabConstraint: CANNON.Constraint | null;
    syncFromItems: (nextItems: GachaBoxItem[]) => void;
    resetClawToHome: () => void;
  } | null>(null);

  // 새 턴 시작 감지 -> ready_right 진입
  useEffect(() => {
    if (isMyTurn && turnKey) {
      setDroppedThisTurn(0);
      if (simControlRef.current) {
        simControlRef.current.resetClawToHome();
        simControlRef.current.syncFromItems(itemsRef.current);
      }
      setCranePhase('ready_right');
      playTone(523.25, 0.12, 'sine', 0.1);
    } else if (!isMyTurn && phaseRef.current !== 'idle') {
      setCranePhase('idle');
    }
  }, [isMyTurn, turnKey, setCranePhase, playTone]);

  // 대기 상태에서 서버 폴링으로 items 변경 시 3D 씬 동기화
  useEffect(() => {
    if (phaseRef.current === 'idle' && simControlRef.current) {
      simControlRef.current.syncFromItems(items);
    }
  }, [items]);

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
    const applyResponsiveCamera = (w: number, h: number) => {
      const aspect = Math.max(0.55, w / Math.max(1, h));
      camera.aspect = aspect;
      // 모바일 세로/정사각 화면에서는 가로폭 전체(좌우 기둥 ±3.3)가 잘리지 않도록 카메라 거리 및 화각 자동 보정
      const scale = aspect < 1.48 ? Math.min(1.95, 1.52 / aspect) : 1.0;
      camera.fov = aspect < 1.15 ? 48 : 42;
      camera.position.set(0, 4.15 * (1 + (scale - 1) * 0.72), 6.25 * scale);
      camera.lookAt(0, 0.78, 0);
      camera.updateProjectionMatrix();
    };
    applyResponsiveCamera(width, height);

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
    cyanLight.position.set(-3.2, 2.6, 1.2);
    scene.add(cyanLight);

    const amberLight = new THREE.PointLight('#f59e0b', 10, 12);
    amberLight.position.set(3.2, 2.6, 1.2);
    scene.add(amberLight);

    const chuteLight = new THREE.PointLight('#10b981', 8, 8);
    chuteLight.position.set(0, -0.7, 0);
    scene.add(chuteLight);

    // 3. Arcade Cabinet Visual Geometry
    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // 하단 WIN CHUTE 바닥 (빛나는 배출구)
    const chuteGeo = new THREE.BoxGeometry(6.8, 0.15, 3.2);
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
    const gridHelper = new THREE.GridHelper(6.6, 14, '#10b981', '#065f46');
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
    const pillarCoords = [
      [-3.28, 0.9, -1.48],
      [3.28, 0.9, -1.48],
      [-3.28, 0.9, 1.48],
      [3.28, 0.9, 1.48],
    ];
    pillarCoords.forEach(([px, py, pz]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(px, py, pz);
      cabinetGroup.add(p);
    });

    // 상단 레일 프레임
    const frameBarMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.25 });
    const railSideGeo = new THREE.BoxGeometry(0.12, 0.12, 3.1);
    [-3.28, 3.28].forEach((rx) => {
      const r = new THREE.Mesh(railSideGeo, frameBarMat);
      r.position.set(rx, 3.25, 0);
      cabinetGroup.add(r);
    });

    // 이동식 Z-갠트리 빔 & X-트롤리
    const gantryBeam = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.1, 0.14),
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
    const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(6.56, 3.4), acrylicMat);
    backGlass.position.set(0, 0.8, -1.46);
    cabinetGroup.add(backGlass);

    [-3.24, 3.24].forEach((sx) => {
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
    frontRampMesh.position.set(0, 0.96, 1.18);
    frontRampMesh.rotation.x = -0.58;
    cabinetGroup.add(frontRampMesh);

    const backRampMesh = new THREE.Mesh(rampVisualGeo, rampVisualMat);
    backRampMesh.position.set(0, 0.96, -1.18);
    backRampMesh.rotation.x = 0.58;
    cabinetGroup.add(backRampMesh);

    // 2개의 평행 UFO 브릿지 Bar (크롬 바 + 실리콘 논슬립 링)
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

    [-GACHA_PHYSICS.BAR_HALF_Z, GACHA_PHYSICS.BAR_HALF_Z].forEach((bz) => {
      const barMesh = new THREE.Mesh(barGeo, barMatVisual);
      barMesh.position.set(0, GACHA_PHYSICS.BAR_Y, bz);
      barMesh.castShadow = true;
      barMesh.receiveShadow = true;
      cabinetGroup.add(barMesh);

      // 슬롯 경계마다 미끄럼방지 실리콘 링 배치
      for (let rx = -2.8; rx <= 2.81; rx += 0.7) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(rx, GACHA_PHYSICS.BAR_Y, bz);
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

    // 좌/우 관절 집게 암
    const armMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.2 });
    const tipMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#ea580c', emissiveIntensity: 0.25, roughness: 0.5 });

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.2, 0.02, 0);
    const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.08), armMat);
    leftUpper.position.set(-0.08, -0.17, 0);
    leftUpper.rotation.z = -0.25;
    const leftTip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.12), tipMat);
    leftTip.position.set(-0.05, -0.4, 0);
    leftTip.rotation.z = 0.42;
    leftArmPivot.add(leftUpper, leftTip);
    clawGroup.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.2, 0.02, 0);
    const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.08), armMat);
    rightUpper.position.set(0.08, -0.17, 0);
    rightUpper.rotation.z = 0.25;
    const rightTip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.12), tipMat);
    rightTip.position.set(0.05, -0.4, 0);
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
    (world.solver as CANNON.GSSolver).iterations = 14;

    const barPhysMat = new CANNON.Material('bar');
    const boxPhysMat = new CANNON.Material('box');
    const clawPhysMat = new CANNON.Material('claw');

    world.addContactMaterial(
      new CANNON.ContactMaterial(barPhysMat, boxPhysMat, {
        friction: 0.4,
        restitution: 0.06,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(boxPhysMat, boxPhysMat, {
        friction: 0.35,
        restitution: 0.05,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(clawPhysMat, boxPhysMat, {
        friction: 0.45,
        restitution: 0.04,
      })
    );

    // 정적 물리 바디: 평행 Bar 2개
    [-GACHA_PHYSICS.BAR_HALF_Z, GACHA_PHYSICS.BAR_HALF_Z].forEach((bz) => {
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
      barBody.position.set(0, GACHA_PHYSICS.BAR_Y, bz);
      world.addBody(barBody);
    });

    // 정적 물리 바디: 좌우 유리벽 및 앞뒤 경사 가이드(바 바깥으로 떨어지지 않고 중앙 Bar 틈새로 유도)
    [-GACHA_PHYSICS.CABINET_HALF_X - 0.1, GACHA_PHYSICS.CABINET_HALF_X + 0.1].forEach((wx) => {
      const wallBody = new CANNON.Body({ mass: 0, material: barPhysMat });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 2.0, 2.0)));
      wallBody.position.set(wx, 1.0, 0);
      world.addBody(wallBody);
    });

    // 앞 경사 가이드
    const frontRampBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    frontRampBody.addShape(new CANNON.Box(new CANNON.Vec3(GACHA_PHYSICS.BAR_LENGTH / 2, 0.05, 0.42)));
    frontRampBody.position.set(0, 0.96, 1.18);
    frontRampBody.quaternion.setFromEuler(-0.58, 0, 0);
    world.addBody(frontRampBody);

    // 뒤 경사 가이드
    const backRampBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    backRampBody.addShape(new CANNON.Box(new CANNON.Vec3(GACHA_PHYSICS.BAR_LENGTH / 2, 0.05, 0.42)));
    backRampBody.position.set(0, 0.96, -1.18);
    backRampBody.quaternion.setFromEuler(0.58, 0, 0);
    world.addBody(backRampBody);

    // 하단 WIN 슈트 바닥 콜라이더 (떨어진 상자가 안착)
    const floorBody = new CANNON.Body({ mass: 0, material: barPhysMat });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(3.5, 0.1, 2.0)));
    floorBody.position.set(0, -1.55, 0);
    world.addBody(floorBody);

    // Kinematic 크레인 물리 바디 (직접 물리 충돌로 끼인 상자 밀어내기/누르기 지원)
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
    const boxGeo = new THREE.BoxGeometry(GACHA_PHYSICS.BOX_W, GACHA_PHYSICS.BOX_H, GACHA_PHYSICS.BOX_D);

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

      // 추가 및 위치 동기화
      for (const it of nextItems) {
        let ent = boxEntities.get(it.id);
        if (!ent) {
          const mats = createFigureBoxMaterials(it.slotIndex, it.label);
          const mesh = new THREE.Mesh(boxGeo.clone(), mats);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);

          const body = new CANNON.Body({
            mass: GACHA_PHYSICS.BOX_MASS,
            material: boxPhysMat,
            linearDamping: 0.2,
            angularDamping: 0.3,
          });
          body.addShape(
            new CANNON.Box(
              new CANNON.Vec3(GACHA_PHYSICS.BOX_W / 2, GACHA_PHYSICS.BOX_H / 2, GACHA_PHYSICS.BOX_D / 2)
            )
          );
          world.addBody(body);

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

    const state = {
      clawX: GACHA_PHYSICS.CLAW_HOME_X,
      clawY: GACHA_PHYSICS.CLAW_HOME_Y,
      clawZ: GACHA_PHYSICS.CLAW_HOME_Z,
      prongAngle: 0.58,
      phaseTimer: 0,
      settleQuietTime: 0,
      wonSet: new Set<string>(),
      grabConstraint: null as CANNON.Constraint | null,
      syncFromItems,
      resetClawToHome: () => {
        if (state.grabConstraint) {
          world.removeConstraint(state.grabConstraint);
          state.grabConstraint = null;
        }
        state.clawX = GACHA_PHYSICS.CLAW_HOME_X;
        state.clawY = GACHA_PHYSICS.CLAW_HOME_Y;
        state.clawZ = GACHA_PHYSICS.CLAW_HOME_Z;
        state.prongAngle = 0.58;
        state.phaseTimer = 0;
        state.settleQuietTime = 0;
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
      const updatedItems = Array.from(boxEntities.values()).map((ent) => ({
        id: ent.data.id,
        position: [ent.body.position.x, ent.body.position.y, ent.body.position.z] as [number, number, number],
        quaternion: [
          ent.body.quaternion.x,
          ent.body.quaternion.y,
          ent.body.quaternion.z,
          ent.body.quaternion.w,
        ] as [number, number, number, number],
      }));

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

      // 크레인 위치/단계 제어
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
        state.clawY = Math.max(GACHA_PHYSICS.CLAW_DROP_Y, state.clawY - 1.9 * dt);
        state.prongAngle = 0.62;

        // 상자 상단에 닿으면 조기 정지
        let hitBoxTop = false;
        for (const ent of boxEntities.values()) {
          if (state.wonSet.has(ent.data.id)) continue;
          const dx = Math.abs(ent.body.position.x - state.clawX);
          const dz = Math.abs(ent.body.position.z - state.clawZ);
          if (
            dx < 0.42 &&
            dz < GACHA_PHYSICS.BOX_D / 2 - 0.04 &&
            state.clawY <= ent.body.position.y + GACHA_PHYSICS.BOX_H / 2 + 0.14
          ) {
            hitBoxTop = true;
            break;
          }
        }

        if (state.clawY <= GACHA_PHYSICS.CLAW_DROP_Y || hitBoxTop) {
          state.phaseTimer = 0;
          setCranePhase('closing');
          playTone(330, 0.1, 'square', 0.05);
        }
      } else if (curPhase === 'closing') {
        state.phaseTimer += dt;
        const progress = Math.min(1, state.phaseTimer / 0.42);
        state.prongAngle = 0.62 - progress * 0.48;

        if (progress >= 1) {
          // 가장 가까운 상자 잡기 판정 (잡는 지점에 따라 자연스럽게 기울어지도록 로컬 오프셋 Constraint 생성)
          const pinchWorld = new CANNON.Vec3(state.clawX, state.clawY - 0.18, state.clawZ);
          let bestEnt: BoxEntity | null = null;
          let bestDist = 0.85;
          let bestLocal = new CANNON.Vec3(0, 0, 0);

          for (const ent of boxEntities.values()) {
            if (state.wonSet.has(ent.data.id)) continue;
            const localPt = ent.body.pointToLocalFrame(pinchWorld);
            if (
              Math.abs(localPt.x) <= GACHA_PHYSICS.BOX_W / 2 + 0.2 &&
              Math.abs(localPt.z) <= GACHA_PHYSICS.BOX_D / 2 + 0.14 &&
              Math.abs(localPt.y) <= GACHA_PHYSICS.BOX_H / 2 + 0.25
            ) {
              const d = pinchWorld.distanceTo(ent.body.position);
              if (d < bestDist) {
                bestDist = d;
                bestEnt = ent;
                bestLocal = new CANNON.Vec3(
                  Math.max(-GACHA_PHYSICS.BOX_W * 0.35, Math.min(GACHA_PHYSICS.BOX_W * 0.35, localPt.x)),
                  GACHA_PHYSICS.BOX_H * 0.25,
                  Math.max(-GACHA_PHYSICS.BOX_D * 0.42, Math.min(GACHA_PHYSICS.BOX_D * 0.42, localPt.z))
                );
              }
            }
          }

          if (bestEnt) {
            // 적당한 힘 한계(maxForce)로 잡아서 무겁거나 각도가 틀어지면 미끄러지며 바 사이로 기울어지게 함
            const constraint = new CANNON.PointToPointConstraint(
              clawAnchorBody,
              new CANNON.Vec3(0, -0.18, 0),
              bestEnt.body,
              bestLocal,
              28
            );
            world.addConstraint(constraint);
            state.grabConstraint = constraint;
          }

          state.phaseTimer = 0;
          setCranePhase('lifting');
          playTone(587.33, 0.12);
        }
      } else if (curPhase === 'lifting') {
        state.phaseTimer += dt;
        state.clawY = Math.min(GACHA_PHYSICS.CLAW_LIFT_Y, state.clawY + 1.35 * dt);
        // 들어올리면서 미세하게 앞(Z+) 또는 중앙으로 끌어당겨 브릿지 탈출/기울기 유도
        if (state.phaseTimer > 0.25 && state.phaseTimer < 0.75) {
          state.clawZ = Math.min(GACHA_PHYSICS.CLAW_MAX_Z, state.clawZ + 0.18 * dt);
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
        state.prongAngle = Math.min(0.62, state.prongAngle + 1.6 * dt);
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
        world.step(1 / 60, dt, 4);

        // 3D 메시 동기화 & 낙하 승리 감지
        for (const ent of boxEntities.values()) {
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

      // 크레인, 갠트리, 와이어, 조준 레이저 위치 업데이트
      clawGroup.position.set(state.clawX, state.clawY, state.clawZ);
      leftArmPivot.rotation.z = -state.prongAngle;
      rightArmPivot.rotation.z = state.prongAngle;
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

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 460;
      applyResponsiveCamera(w, h);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [playTone, setCranePhase]);

  // 조작 버튼 핸들러 (1회성 누르고 떼기)
  const handleRightPressStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
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

  // 키보드 방향키(→, ↑) 지원
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && phaseRef.current === 'ready_right') {
        e.preventDefault();
        setCranePhase('moving_right');
        playTone(350, 0.06);
      } else if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && phaseRef.current === 'ready_up') {
        e.preventDefault();
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
        return '⬆ 상자를 들어올리고 있습니다!';
      case 'releasing':
      case 'settling':
        return droppedThisTurn > 0
          ? '🎉 Bar 사이로 상자가 떨어졌습니다!! 결과 확인 중...'
          : '⚖️ 상자가 Bar 위에서 흔들리며 자리를 잡는 중...';
    }
  })();

  return (
    <div className="w-full rounded-3xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl shadow-cyan-950/30">
      {/* 상단 상태 바 */}
      <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-black shrink-0">
            <Sparkles className="w-3 h-3" />
            UFO BRIDGE 3D
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

      {/* 3D WebGL 캔버스 뷰포트 */}
      <div className="relative w-full h-[280px] sm:h-[440px] bg-[#070b18] select-none">
        <div ref={mountRef} className="w-full h-full" />

        {/* Bar 사이 낙하 안내 뱃지 */}
        <div className="absolute bottom-2.5 left-2.5 pointer-events-none px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-[10px] sm:text-xs font-bold text-emerald-300 backdrop-blur-sm">
          🎯 두 Bar 사이로 박스를 통과시키면 <span className="text-amber-300">0.01 SOL</span> 당첨!
        </div>

        {droppedThisTurn > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg animate-bounce">
            🎊 통과 성공!! 상자 획득!
          </div>
        )}
      </div>

      {/* 하단 아케이드 조작 패널 */}
      <div className="p-4 bg-gradient-to-b from-slate-900 to-slate-950 border-t border-slate-800">
        {phase === 'idle' ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-300 text-center sm:text-left">
              선택된 플레이어: <strong className="text-amber-400">{selectedMember}</strong>{' '}
              <span className="text-slate-400">(보유 뽑기권 {selectedMemberTickets}장)</span>
            </div>
            <button
              type="button"
              disabled={!canStartTurn || isStarting || !!lockedByOther}
              onClick={onStartTurnRequest}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/25 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isStarting
                ? '크레인 준비 중...'
                : lockedByOther
                ? `${lockedByOther}님 플레이 중...`
                : selectedMemberTickets < 1
                ? '뽑기권이 부족합니다 (식사 등록 시 +1장)'
                : '🕹️ 뽑기 시작! (뽑기권 1장 사용)'}
            </button>
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
