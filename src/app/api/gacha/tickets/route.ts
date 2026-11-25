import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MEMBERS } from '@/constants/members';
import { getAllMemberTicketBalances, grantGachaTickets, isAdminAuthorized, recordGachaLog } from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!isAdminAuthorized(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const member = (body?.member || '').trim();
    const amount = Number(body?.amount ?? 1);

    if (!member || !MEMBERS.some((m) => m.name === member)) {
      return NextResponse.json(
        { success: false, message: '유효한 멤버를 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 50) {
      return NextResponse.json(
        { success: false, message: '유효한 지급 수량을 입력해주세요.' },
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

    const balance = await grantGachaTickets(db, member, amount);
    const ticketsByMember = await getAllMemberTicketBalances(db);
    const message = `${member}님에게 뽑기권 ${amount > 0 ? `+${amount}` : amount}장 반영 완료 (현재 ${balance}장)`;

    await recordGachaLog(db, {
      type: 'admin_ticket',
      member,
      message,
      meta: { amount, balanceAfter: balance },
    });

    return NextResponse.json({
      success: true,
      message,
      ticketsByMember,
    });
  } catch (error: any) {
    console.error('Failed to adjust gacha tickets:', error);
    return NextResponse.json(
      { success: false, message: '뽑기권 조정 실패', error: error.message },
      { status: 500 }
    );
  }
}
