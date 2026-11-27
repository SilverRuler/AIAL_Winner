import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { grantGachaTickets, recordGachaLog } from '@/lib/gachaServer';
import { getClientIp, normalizeIp } from '@/lib/ip';

export const dynamic = 'force-dynamic';

const ATTENDANCE_REWARD_TICKETS = 3;
const KST_OFFSET_MS = 9 * 3600 * 1000;

type AttendanceSlotKey = 'morning' | 'afternoon';

function getKstAttendanceWindow(nowMs: number): {
  kstDate: string;
  kstTime: string;
  hour: number;
  minute: number;
  activeWindow: AttendanceSlotKey | null;
  activeWindowLabel: string | null;
  nextWindowLabel: string;
} {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  const second = kst.getUTCSeconds();

  const kstDate = `${yyyy}-${mm}-${dd}`;
  const kstTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  let activeWindow: AttendanceSlotKey | null = null;
  let activeWindowLabel: string | null = null;

  // 오전 08:00~10:00 (08:00:00 ~ 10:00:59 KST)
  if ((hour >= 8 && hour < 10) || (hour === 10 && minute === 0)) {
    activeWindow = 'morning';
    activeWindowLabel = '오전 출석 (08:00~10:00)';
  }
  // 저녁 18:00~20:00 (18:00:00 ~ 20:00:59 KST)
  else if ((hour >= 18 && hour < 20) || (hour === 20 && minute === 0)) {
    activeWindow = 'afternoon';
    activeWindowLabel = '저녁 출석 (18:00~20:00)';
  }

  let nextWindowLabel = '내일 오전 08:00~10:00';
  if (hour < 8) {
    nextWindowLabel = '오늘 오전 08:00~10:00';
  } else if (hour < 18) {
    nextWindowLabel = '오늘 저녁 18:00~20:00';
  }

  return {
    kstDate,
    kstTime,
    hour,
    minute,
    activeWindow,
    activeWindowLabel,
    nextWindowLabel,
  };
}

async function getTodayClaimedMap(db: any, kstDate: string) {
  const docs = await db
    .collection('gacha_attendance')
    .find({ date: kstDate }, { projection: { member: 1, slot: 1 } })
    .toArray();
  const claimedMorning: string[] = [];
  const claimedAfternoon: string[] = [];
  for (const d of docs as any[]) {
    if (d.slot === 'morning' && d.member) claimedMorning.push(d.member);
    if (d.slot === 'afternoon' && d.member) claimedAfternoon.push(d.member);
  }
  return { claimedMorning, claimedAfternoon };
}

export async function GET() {
  try {
    const nowMs = Date.now();
    const info = getKstAttendanceWindow(nowMs);
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const { claimedMorning, claimedAfternoon } = await getTodayClaimedMap(db, info.kstDate);

    return NextResponse.json(
      {
        success: true,
        serverNow: nowMs,
        kstDate: info.kstDate,
        kstTime: info.kstTime,
        activeWindow: info.activeWindow,
        activeWindowLabel: info.activeWindowLabel,
        nextWindowLabel: info.nextWindowLabel,
        rewardTickets: ATTENDANCE_REWARD_TICKETS,
        claimedMorning,
        claimedAfternoon,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to get attendance state:', error);
    return NextResponse.json(
      { success: false, message: '출석보상 정보 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const member = String(body?.member || '').trim();

    if (!member || !MEMBERS.some((m) => m.name === member)) {
      return NextResponse.json(
        { success: false, message: '올바른 유저 닉네임을 선택해주세요.' },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const info = getKstAttendanceWindow(nowMs);

    if (!info.activeWindow || !info.activeWindowLabel) {
      return NextResponse.json(
        {
          success: false,
          message: `출석보상은 매일 오전 08:00~10:00, 저녁 18:00~20:00 (KST)에만 받을 수 있습니다. (현재 ${info.kstTime})`,
          serverNow: nowMs,
          kstTime: info.kstTime,
          activeWindow: null,
        },
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

    const docId = `att_${info.kstDate}_${info.activeWindow}_${member}`;
    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || rawIp || '';

    try {
      await db.collection('gacha_attendance').insertOne({
        _id: docId as any,
        id: docId,
        date: info.kstDate,
        slot: info.activeWindow,
        member,
        ticketsGranted: ATTENDANCE_REWARD_TICKETS,
        ip: clientIp,
        kstTime: info.kstTime,
        createdAt: nowMs,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        return NextResponse.json(
          {
            success: false,
            message: `${member}님은 이미 ${info.activeWindowLabel} 출석보상을 받으셨습니다!`,
          },
          { status: 409 }
        );
      }
      throw err;
    }

    const newTickets = await grantGachaTickets(db, member, ATTENDANCE_REWARD_TICKETS);
    await recordGachaLog(db, {
      type: 'attendance',
      member,
      message: `📅 [출석보상] ${member}님이 ${info.activeWindowLabel} 출석으로 뽑기권 +${ATTENDANCE_REWARD_TICKETS}장을 받았습니다! (보유 ${newTickets}장)`,
      meta: {
        date: info.kstDate,
        slot: info.activeWindow,
        ticketsGranted: ATTENDANCE_REWARD_TICKETS,
        newTickets,
        ip: clientIp,
      },
      createdAt: nowMs,
    });

    const { claimedMorning, claimedAfternoon } = await getTodayClaimedMap(db, info.kstDate);

    return NextResponse.json({
      success: true,
      message: `🎉 ${member}님 출석보상 완료! 뽑기권 +${ATTENDANCE_REWARD_TICKETS}장이 지급되었습니다. (보유 ${newTickets}장)`,
      member,
      ticketsGranted: ATTENDANCE_REWARD_TICKETS,
      newTickets,
      slot: info.activeWindow,
      slotLabel: info.activeWindowLabel,
      claimedMorning,
      claimedAfternoon,
    });
  } catch (error: any) {
    console.error('Failed to claim attendance reward:', error);
    return NextResponse.json(
      { success: false, message: '출석보상 지급 처리 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
