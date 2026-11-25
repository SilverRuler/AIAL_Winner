import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { GACHA_PHYSICS } from '@/constants/gacha';

/**
 * POST /api/gacha/heartbeat
 * 현재 뽑기를 진행 중인 플레이어의 턴 락(TTL)을 안전하게 연장
 * (플레이 도중 락 만료 방지 + 비정상 이탈 시 25초 내 자동 해제 보장)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { turnId, member, machineIndex } = body || {};

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
