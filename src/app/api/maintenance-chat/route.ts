import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getClientIp, maskIp } from '@/lib/ip';

export const dynamic = 'force-dynamic';

interface MaintenanceChatDoc {
  id: string;
  nickname: string;
  maskedIp: string;
  content: string;
  createdAt: number;
  ip?: string;
  userAgent?: string;
}

const MAX_LIST = 150;

export async function GET() {
  try {
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'DB 연결을 확인할 수 없습니다.', messages: [] },
        { status: 503 }
      );
    }

    const docs = await db
      .collection<MaintenanceChatDoc>('maintenance_chats')
      .find({}, { projection: { _id: 0, ip: 0, userAgent: 0 } })
      .sort({ createdAt: -1 })
      .limit(MAX_LIST)
      .toArray();

    docs.reverse();

    return NextResponse.json(
      { success: true, messages: docs },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '채팅 조회 오류';
    return NextResponse.json({ success: false, message: msg, messages: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawNickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    const rawContent = typeof body?.content === 'string' ? body.content.trim() : '';

    if (!rawContent) {
      return NextResponse.json(
        { success: false, message: '채팅 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    const nickname = (rawNickname || 'ㅇㅇ').slice(0, 16);
    const content = rawContent.slice(0, 300);
    const clientIp = getClientIp(request);
    const maskedIp = maskIp(clientIp) || '0.0';
    const userAgent = (request.headers.get('user-agent') || '').trim();
    const now = Date.now();

    const doc: MaintenanceChatDoc = {
      id: `mchat_${now}_${Math.random().toString(36).substring(2, 8)}`,
      nickname,
      maskedIp,
      content,
      createdAt: now,
      ip: clientIp,
      userAgent: userAgent || undefined,
    };

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'DB 연결을 확인할 수 없습니다.' },
        { status: 503 }
      );
    }

    await db.collection<MaintenanceChatDoc>('maintenance_chats').insertOne(doc);

    return NextResponse.json(
      {
        success: true,
        message: {
          id: doc.id,
          nickname: doc.nickname,
          maskedIp: doc.maskedIp,
          content: doc.content,
          createdAt: doc.createdAt,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '채팅 등록 오류';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
