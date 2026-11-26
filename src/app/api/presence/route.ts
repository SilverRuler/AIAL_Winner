import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthorized } from '@/lib/gachaServer';
import { getActivePresenceSummary, recordPresence } from '@/lib/presence';

export const dynamic = 'force-dynamic';

/**
 * GET /api/presence
 * - ?track=main / ?track=maintenance 시 호출자의 접속 상태(인메모리) 갱신
 * - 일반 유저: totalActive, byArea, playingCount만 반환 (IP 비공개)
 * - 관리자(x-admin-id/x-admin-pw): IP별 실시간 동접 세션 전체 목록(sessions) 포함 반환
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const track = (searchParams.get('track') || '').trim();
    const member = (searchParams.get('member') || '').trim();

    if (track === 'main') {
      recordPresence(request, {
        area: 'main',
        page: '식사배틀 메인',
        engine: 'Web',
        member: member || undefined,
      });
    } else if (track === 'maintenance') {
      recordPresence(request, {
        area: 'maintenance',
        page: '점검중 대기 페이지',
        engine: 'Web',
        member: member || undefined,
        preserveRecentGachaMs: 6000,
      });
    }

    const summary = getActivePresenceSummary();
    const isAdmin = isAdminAuthorized(request);

    if (!isAdmin) {
      return NextResponse.json(
        {
          success: true,
          isAdmin: false,
          serverNow: summary.serverNow,
          ttlSec: summary.ttlSec,
          totalActive: summary.totalActive,
          playingCount: summary.playingCount,
          byArea: summary.byArea,
        },
        {
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        isAdmin: true,
        ...summary,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || '동접 현황 조회 실패' },
      { status: 500 }
    );
  }
}
