import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthorized } from '@/lib/gachaServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!isAdminAuthorized(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자 아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: '인증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
