import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pageRaw = Number(searchParams.get('page') || '1');
    const limitRaw = Number(searchParams.get('limit') || '10');
    const machineRaw = searchParams.get('machine');
    const machineIdx =
      machineRaw !== null && /^\d+$/.test(machineRaw) ? Number(machineRaw) : undefined;
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(50, Math.floor(limitRaw)) : 10;

    const filter = machineIdx !== undefined ? { 'meta.machineIndex': machineIdx } : {};
    const col = db.collection('gacha_logs');
    const [totalCount, rawLogs] = await Promise.all([
      col.countDocuments(filter),
      col
        .find(
          filter,
          {
            projection: {
              id: 1,
              type: 1,
              member: 1,
              message: 1,
              createdAt: 1,
              'meta.machineIndex': 1,
            },
          }
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const logs = rawLogs.map((doc: any) => ({
      id: doc.id || String(doc._id),
      type: doc.type || 'info',
      member: doc.member || 'SYSTEM',
      message: doc.message || '',
      createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : 0,
      machineIndex:
        typeof doc.meta?.machineIndex === 'number' ? doc.meta.machineIndex : undefined,
    }));

    return NextResponse.json(
      {
        success: true,
        logs,
        page,
        limit,
        totalCount,
        totalPages,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to get gacha logs:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 최근 상황 로그 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}
