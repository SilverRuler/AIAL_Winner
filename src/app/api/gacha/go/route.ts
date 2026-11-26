import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { isAdminAuthorized } from '@/lib/gachaServer';

export const dynamic = 'force-dynamic';

const ALLOWED_PORTS = [4000, 4100] as const;
const DEFAULT_PORT = 4100; // Rapier3D (4100) / Jolt Physics (4000) 즉시 스위칭 가능
const GACHA_HOST = process.env.GACHA_SERVER_HOST || 'oci2.silverruler.xyz';

async function getActiveGachaPort(): Promise<number> {
  try {
    const db = await getDatabase();
    if (db) {
      const doc = (await db
        .collection('gacha_settings')
        .findOne({ _id: 'redirect_target' as any })) as any;
      const p = Number(doc?.port);
      if (p === 4000 || p === 4100) return p;
    }
  } catch {}
  const envPort = Number(process.env.GACHA_TARGET_PORT);
  if (envPort === 4000 || envPort === 4100) return envPort;
  return DEFAULT_PORT;
}

/**
 * GET /api/gacha/go?member=...&machine=...
 * 위너 사이트에서 뽑기하러 가기 클릭 시 현재 활성 포트(4000 Jolt / 4100 Rapier)로 즉시 리다이렉션
 */
export async function GET(request: NextRequest) {
  const port = await getActiveGachaPort();
  const { searchParams } = new URL(request.url);
  const member = searchParams.get('member');
  const machine = searchParams.get('machine');
  const nextParams = new URLSearchParams();
  if (member) nextParams.set('member', member);
  if (machine) nextParams.set('machine', machine);
  const qs = nextParams.toString();
  const targetUrl = `http://${GACHA_HOST}:${port}${qs ? `?${qs}` : ''}`;

  const res = NextResponse.redirect(targetUrl, 302);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}

/**
 * POST /api/gacha/go (관리자 전용: 4000 <-> 4100 무중단 즉시 스위칭)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!isAdminAuthorized(request, body)) {
      return NextResponse.json({ success: false, message: '관리자 인증 필요' }, { status: 401 });
    }
    const port = Number(body?.port);
    if (!ALLOWED_PORTS.includes(port as 4000 | 4100)) {
      return NextResponse.json(
        { success: false, message: '지원 포트는 4000(Jolt) 또는 4100(Rapier3D)입니다.' },
        { status: 400 }
      );
    }
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({ success: false, message: 'DB 연결 실패' }, { status: 500 });
    }
    const engine = port === 4000 ? 'Jolt Physics' : 'Rapier3D';
    await db.collection('gacha_settings').updateOne(
      { _id: 'redirect_target' as any },
      { $set: { port, engine, updatedAt: Date.now() } },
      { upsert: true }
    );
    return NextResponse.json({ success: true, port, engine });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || '오류' }, { status: 500 });
  }
}
