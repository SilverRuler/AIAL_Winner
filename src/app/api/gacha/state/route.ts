import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import {
  getAllMemberTicketBalances,
  getOrInitMachineState,
  sanitizeMachineForClient,
} from '@/lib/gachaServer';

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

    const [machine, ticketsByMember, unclaimedRaw, recentRaw] = await Promise.all([
      getOrInitMachineState(db),
      getAllMemberTicketBalances(db),
      db
        .collection('gacha_wins')
        .find({ claimStatus: 'unclaimed' })
        .sort({ createdAt: -1 })
        .toArray(),
      db
        .collection('gacha_wins')
        .find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    const formatWin = (doc: any) => ({
      id: doc.id || doc._id.toString(),
      member: doc.member,
      boxId: doc.boxId,
      boxLabel: doc.boxLabel,
      colorTheme: doc.colorTheme,
      rewardType: doc.rewardType || 'SOL',
      rewardAmount: typeof doc.rewardAmount === 'number' ? doc.rewardAmount : 0.005,
      unboxed: Boolean(doc.unboxed),
      claimStatus: doc.claimStatus || 'unclaimed',
      walletAddress: doc.walletAddress || '',
      memo: doc.memo || '',
      createdAt: doc.createdAt || 0,
      claimedAt: doc.claimedAt,
    });

    return NextResponse.json(
      {
        success: true,
        machine: sanitizeMachineForClient(machine),
        ticketsByMember,
        unclaimedWins: unclaimedRaw.map(formatWin),
        recentWins: recentRaw.map(formatWin),
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to get gacha state:', error);
    return NextResponse.json(
      { success: false, message: '뽑기 상태 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}
