import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GACHA_PHYSICS } from '@/constants/gacha';
import { getGachaMachineOps } from '@/lib/gachaServer';
import { buildGachaPageLabel, recordPresence } from '@/lib/presence';

/**
 * POST /api/gacha/heartbeat
 * 현재 뽑기를 진행 중인 플레이어의 턴 락(TTL)을 안전하게 연장
 * (플레이 도중 락 만료 방지 + 비정상 이탈 시 25초 내 자동 해제 보장)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { turnId, member, machineIndex, engine } = body || {};

    if (!turnId || !member) {
      return NextResponse.json(
        { success: false, message: 'turnId와 member가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const now = Date.now();
    const machineOps = await getGachaMachineOps(db);
    if (machineOps.suspended) {
      await db.collection('gacha_machine').updateMany(
        { 'lock.turnId': turnId, 'lock.member': member },
        {
          $set: {
            lock: {
              active: false,
              member: null,
              turnId: null,
              startedAt: null,
              expiresAt: null,
            },
            updatedAt: now,
          },
        }
      );
      return NextResponse.json(
        {
          success: false,
          suspended: true,
          message: '전 기기 운영 중단(점검중) 상태입니다.',
          serverNow: now,
        },
        { status: 503 }
      );
    }

    const nextExpiresAt = now + GACHA_PHYSICS.LOCK_TTL_MS;

    const filter: Record<string, any> = {
      'lock.active': true,
      'lock.turnId': turnId,
      'lock.member': member,
    };
    if (typeof machineIndex === 'number' && Number.isInteger(machineIndex)) {
      filter.machineIndex = machineIndex;
    }

    const res = await db.collection('gacha_machine').findOneAndUpdate(
      filter,
      {
        $set: {
          'lock.expiresAt': nextExpiresAt,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!res) {
      return NextResponse.json(
        { success: false, message: '유효한 턴 락이 아닙니다.', serverNow: now },
        { status: 409 }
      );
    }

    const resolvedIdx = typeof machineIndex === 'number' ? machineIndex : (res as any).machineIndex;
    recordPresence(request, {
      area: 'gacha',
      engine: typeof engine === 'string' && engine ? engine : 'Gacha',
      machineIndex: typeof resolvedIdx === 'number' ? resolvedIdx : undefined,
      member: String(member),
      isPlaying: true,
      page: buildGachaPageLabel(
        typeof engine === 'string' && engine ? engine : 'Gacha',
        typeof resolvedIdx === 'number' ? resolvedIdx : undefined,
        false
      ),
    });

    return NextResponse.json({
      success: true,
      expiresAt: nextExpiresAt,
      serverNow: now,
    });
  } catch (error: any) {
    console.error('Failed to extend gacha heartbeat:', error);
    return NextResponse.json(
      { success: false, message: '하트비트 갱신 실패' },
      { status: 500 }
    );
  }
}
