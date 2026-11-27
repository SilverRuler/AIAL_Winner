import { NextRequest, NextResponse } from 'next/server';
import { GACHA_MACHINE_COUNT } from '@/constants/gacha';
import { getDatabase } from '@/lib/mongodb';
import { isGachaMachineSuspendedFast } from '@/lib/gachaServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface GachaLiveFrame {
  machineIndex: number;
  turnKey: string;
  member: string;
  phase: string;
  gantryX: number;
  gantryZ: number;
  headPos: [number, number, number];
  headQuat: [number, number, number, number];
  leftArmPos: [number, number, number];
  leftArmQuat: [number, number, number, number];
  rightArmPos: [number, number, number];
  rightArmQuat: [number, number, number, number];
  backArmPos?: [number, number, number];
  backArmQuat?: [number, number, number, number];
  frontArmPos?: [number, number, number];
  frontArmQuat?: [number, number, number, number];
  items: Array<{
    id: string;
    position: [number, number, number];
    quaternion: [number, number, number, number];
  }>;
  effect?: 'start' | 'balance_catch' | 'extreme_drr' | 'near_near' | 'finish_win' | null;
  effectSeq?: number;
  ts: number;
}

type LiveListener = (payload: { type: 'frame'; frame: GachaLiveFrame } | { type: 'clear'; machineIndex: number; ts: number }) => void;

interface GachaLiveHub {
  frames: Map<number, GachaLiveFrame>;
  listeners: Map<number, Set<LiveListener>>;
}

const g = globalThis as unknown as { __aialGachaLiveHub?: GachaLiveHub };
function getHub(): GachaLiveHub {
  if (!g.__aialGachaLiveHub) {
    g.__aialGachaLiveHub = {
      frames: new Map(),
      listeners: new Map(),
    };
  }
  return g.__aialGachaLiveHub;
}

const FRAME_TTL_MS = 12_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
    }

    const machineIndex = Number(body.machineIndex);
    if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex >= GACHA_MACHINE_COUNT) {
      return NextResponse.json({ success: false, message: 'Invalid machineIndex' }, { status: 400 });
    }

    const hub = getHub();
    const now = Date.now();

    if (body.clear) {
      hub.frames.delete(machineIndex);
      const set = hub.listeners.get(machineIndex);
      if (set) {
        const msg = { type: 'clear' as const, machineIndex, ts: now };
        for (const fn of set) {
          try {
            fn(msg);
          } catch {}
        }
      }
      return NextResponse.json({ success: true });
    }

    const db = await getDatabase();
    if (db && (await isGachaMachineSuspendedFast(db, machineIndex))) {
      return NextResponse.json(
        { success: false, suspended: true, message: '현재 운영 중단(점검중) 상태입니다.' },
        { status: 503 }
      );
    }

    const frame: GachaLiveFrame = {
      machineIndex,
      turnKey: String(body.turnKey || ''),
      member: String(body.member || ''),
      phase: String(body.phase || 'idle'),
      gantryX: Number(body.gantryX) || 0,
      gantryZ: Number(body.gantryZ) || 0,
      headPos: Array.isArray(body.headPos) ? body.headPos.slice(0, 3).map(Number) as [number, number, number] : [0, 3, 0],
      headQuat: Array.isArray(body.headQuat) ? body.headQuat.slice(0, 4).map(Number) as [number, number, number, number] : [0, 0, 0, 1],
      leftArmPos: Array.isArray(body.leftArmPos) ? body.leftArmPos.slice(0, 3).map(Number) as [number, number, number] : [0, 3, 0],
      leftArmQuat: Array.isArray(body.leftArmQuat) ? body.leftArmQuat.slice(0, 4).map(Number) as [number, number, number, number] : [0, 0, 0, 1],
      rightArmPos: Array.isArray(body.rightArmPos) ? body.rightArmPos.slice(0, 3).map(Number) as [number, number, number] : [0, 3, 0],
      rightArmQuat: Array.isArray(body.rightArmQuat) ? body.rightArmQuat.slice(0, 4).map(Number) as [number, number, number, number] : [0, 0, 0, 1],
      ...(Array.isArray(body.backArmPos) && Array.isArray(body.backArmQuat)
        ? {
            backArmPos: body.backArmPos.slice(0, 3).map(Number) as [number, number, number],
            backArmQuat: body.backArmQuat.slice(0, 4).map(Number) as [number, number, number, number],
          }
        : {}),
      ...(Array.isArray(body.frontArmPos) && Array.isArray(body.frontArmQuat)
        ? {
            frontArmPos: body.frontArmPos.slice(0, 3).map(Number) as [number, number, number],
            frontArmQuat: body.frontArmQuat.slice(0, 4).map(Number) as [number, number, number, number],
          }
        : {}),
      items: Array.isArray(body.items)
        ? body.items.slice(0, 120).map((it: any) => ({
            id: String(it?.id || ''),
            position: Array.isArray(it?.position) ? it.position.slice(0, 3).map(Number) as [number, number, number] : [0, 1, 0],
            quaternion: Array.isArray(it?.quaternion) ? it.quaternion.slice(0, 4).map(Number) as [number, number, number, number] : [0, 0, 0, 1],
          }))
        : [],
      effect: body.effect || null,
      effectSeq: typeof body.effectSeq === 'number' ? body.effectSeq : undefined,
      ts: now,
    };

    hub.frames.set(machineIndex, frame);
    const set = hub.listeners.get(machineIndex);
    if (set && set.size > 0) {
      const msg = { type: 'frame' as const, frame };
      for (const fn of set) {
        try {
          fn(msg);
        } catch {}
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const machineIndex = Number(searchParams.get('machineIndex') ?? '0');
  if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex >= GACHA_MACHINE_COUNT) {
    return NextResponse.json({ success: false, message: 'Invalid machineIndex' }, { status: 400 });
  }

  const hub = getHub();
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeSend = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          cleanup?.();
        }
      };

      const listener: LiveListener = (payload) => {
        safeSend(`data: ${JSON.stringify(payload)}\n\n`);
      };

      let set = hub.listeners.get(machineIndex);
      if (!set) {
        set = new Set();
        hub.listeners.set(machineIndex, set);
      }
      set.add(listener);

      // Send initial comment & latest cached frame if fresh
      safeSend(`: connected machine=${machineIndex}\n\n`);
      const latest = hub.frames.get(machineIndex);
      if (latest && Date.now() - latest.ts < FRAME_TTL_MS) {
        safeSend(`data: ${JSON.stringify({ type: 'frame', frame: latest })}\n\n`);
      }

      const pingTimer = setInterval(() => {
        safeSend(`: ping ${Date.now()}\n\n`);
      }, 15_000);

      cleanup = () => {
        clearInterval(pingTimer);
        const curSet = hub.listeners.get(machineIndex);
        if (curSet) {
          curSet.delete(listener);
          if (curSet.size === 0) hub.listeners.delete(machineIndex);
        }
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener('abort', () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
