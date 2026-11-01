import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { RewardItem, OnChainSnapshot } from '@/types/meal';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

/**
 * 솔라나 RPC를 통해 온체인 트랜잭션 영구 증빙 스냅샷 추출
 */
async function fetchSolanaTxSnapshot(txHash: string): Promise<OnChainSnapshot | null> {
  const rpcs = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://rpc.ankr.com/solana',
  ];

  for (const rpc of rpcs) {
    try {
      const resp = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txHash,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ],
        }),
        signal: AbortSignal.timeout(6000),
      });

      const data = await resp.json();
      if (data.result) {
        const res = data.result;
        const blockTime = res.blockTime;
        const dateObj = blockTime ? new Date(blockTime * 1000) : null;
        const keys = res.transaction?.message?.accountKeys || [];
        const signer =
          keys.find((k: any) => k.signer)?.pubkey ||
          (typeof keys[0] === 'string' ? keys[0] : keys[0]?.pubkey) ||
          '';

        let recipient = '';
        const instructions = res.transaction?.message?.instructions || [];
        for (const inst of instructions) {
          if (inst.parsed?.type === 'transfer' && inst.parsed?.info?.destination) {
            recipient = inst.parsed.info.destination;
            break;
          }
        }
        if (!recipient && keys.length > 1) {
          recipient = typeof keys[1] === 'string' ? keys[1] : keys[1]?.pubkey || '';
        }

        return {
          status: res.meta?.err ? 'Failed' : 'Success',
          verified: !res.meta?.err,
          slot: res.slot,
          blockTime: res.blockTime,
          blockTimeFormatted: dateObj
            ? dateObj.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
            : '',
          fee: ((res.meta?.fee || 0) / 1e9).toFixed(6) + ' SOL',
          feeLamports: res.meta?.fee || 0,
          sender: signer,
          recipient: recipient,
          signature: txHash,
          capturedAt: Date.now(),
          capturedAtFormatted: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
          explorerUrl: `https://solscan.io/tx/${txHash}`,
        };
      }
    } catch (e) {
      // 다음 RPC로 폴백 시도
    }
  }
  return null;
}

/**
 * GET /api/rewards
 * 리워드 지급 내역 조회 (전체 또는 특정 멤버별)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const member = searchParams.get('member');

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({ success: true, rewards: [] });
    }

    const query: any = {};
    if (member && member !== 'all') {
      query.member = member;
    }

    const rawRewards = await db
      .collection('rewards')
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    const rewards: RewardItem[] = rawRewards.map((doc: any) => ({
      id: doc.id || doc._id.toString(),
      member: doc.member,
      amount: typeof doc.amount === 'number' ? doc.amount : parseFloat(doc.amount) || 0,
      unit: doc.unit || 'SOL',
      title: doc.title || '식사 배틀 리워드',
      txHash: (doc.txHash || '').trim(),
      date: doc.date || '',
      memo: doc.memo || '',
      recipientWallet: doc.recipientWallet || '',
      onChainSnapshot: doc.onChainSnapshot || undefined,
      createdAt: doc.createdAt || Date.now(),
      updatedAt: doc.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      rewards,
    });
  } catch (error: any) {
    console.error('Failed to get rewards:', error);
    return NextResponse.json(
      { success: false, message: '리워드 목록 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rewards
 * 관리자 전용: 솔라나 리워드 지급 내역 신규 등록 (온체인 스냅샷 자동 박제)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      member,
      amount,
      unit = 'SOL',
      title,
      txHash,
      date,
      memo,
      recipientWallet,
      adminId,
      adminPw,
    } = body;

    // 관리자 인증
    const reqAdminId = adminId || request.headers.get('x-admin-id');
    const reqAdminPw = adminPw || request.headers.get('x-admin-pw');

    if (reqAdminId !== ADMIN_ID || reqAdminPw !== ADMIN_PW) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    if (!member || !txHash || amount === undefined || amount === null) {
      return NextResponse.json(
        { success: false, message: '멤버, 지급 수량(SOL), 트랜잭션 해시(txHash)는 필수 항목입니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스에 연결할 수 없습니다.' },
        { status: 500 }
      );
    }

    const cleanTxHash = String(txHash).trim();
    const now = Date.now();

    // 온체인 영구 증빙 스냅샷 자동 추출
    let snapshot: OnChainSnapshot | null = null;
    try {
      snapshot = await fetchSolanaTxSnapshot(cleanTxHash);
    } catch (e) {
      console.warn('Could not fetch snapshot immediately:', e);
    }

    const newReward: RewardItem = {
      id: `rew_${now}_${Math.random().toString(36).substring(2, 9)}`,
      member: String(member).trim(),
      amount: parseFloat(String(amount)) || 0,
      unit: String(unit || 'SOL').trim(),
      title: String(title || '식사 배틀 우승 리워드').trim(),
      txHash: cleanTxHash,
      date: date || new Date().toISOString().split('T')[0],
      memo: memo ? String(memo).trim() : '',
      recipientWallet: recipientWallet ? String(recipientWallet).trim() : '',
      onChainSnapshot: snapshot || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('rewards').insertOne({ ...newReward });

    return NextResponse.json({
      success: true,
      message: '리워드 지급 내역 및 온체인 스냅샷이 성공적으로 등록되었습니다.',
      reward: newReward,
    });
  } catch (error: any) {
    console.error('Failed to create reward:', error);
    return NextResponse.json(
      { success: false, message: '리워드 등록 실패', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rewards
 * 관리자 전용: 리워드 지급 내역 수정
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      member,
      amount,
      unit,
      title,
      txHash,
      date,
      memo,
      recipientWallet,
      adminId,
      adminPw,
    } = body;

    const reqAdminId = adminId || request.headers.get('x-admin-id');
    const reqAdminPw = adminPw || request.headers.get('x-admin-pw');

    if (reqAdminId !== ADMIN_ID || reqAdminPw !== ADMIN_PW) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: '수정할 리워드 ID가 필요합니다.' },
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

    const updateFields: any = {
      updatedAt: Date.now(),
    };
    if (member) updateFields.member = String(member).trim();
    if (amount !== undefined) updateFields.amount = parseFloat(String(amount)) || 0;
    if (unit) updateFields.unit = String(unit).trim();
    if (title) updateFields.title = String(title).trim();
    if (txHash) {
      const cleanTx = String(txHash).trim();
      updateFields.txHash = cleanTx;
      // txHash가 변경된 경우 스냅샷 재추출
      try {
        const snap = await fetchSolanaTxSnapshot(cleanTx);
        if (snap) updateFields.onChainSnapshot = snap;
      } catch (e) {}
    }
    if (date) updateFields.date = String(date).trim();
    if (memo !== undefined) updateFields.memo = String(memo).trim();
    if (recipientWallet !== undefined) updateFields.recipientWallet = String(recipientWallet).trim();

    const result = await db.collection('rewards').updateOne(
      { $or: [{ id }, { _id: id as any }] },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: '해당 리워드 내역을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '리워드 지급 내역이 수정되었습니다.',
    });
  } catch (error: any) {
    console.error('Failed to update reward:', error);
    return NextResponse.json(
      { success: false, message: '리워드 수정 실패', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/rewards
 * 온체인 스냅샷 새로고침 및 DB 영구 박제
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, txHash } = body;

    if (!id || !txHash) {
      return NextResponse.json(
        { success: false, message: 'id와 txHash가 필요합니다.' },
        { status: 400 }
      );
    }

    const snapshot = await fetchSolanaTxSnapshot(txHash.trim());
    if (!snapshot) {
      return NextResponse.json(
        { success: false, message: '솔라나 RPC에서 해당 트랜잭션을 찾지 못했습니다.' },
        { status: 404 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({ success: false, message: 'DB 연결 실패' }, { status: 500 });
    }

    await db.collection('rewards').updateOne(
      { $or: [{ id }, { _id: id as any }] },
      { $set: { onChainSnapshot: snapshot, updatedAt: Date.now() } }
    );

    return NextResponse.json({
      success: true,
      message: '온체인 스냅샷이 성공적으로 박제되었습니다.',
      snapshot,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: '스냅샷 갱신 실패', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rewards
 * 관리자 전용: 리워드 지급 내역 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const adminId = searchParams.get('adminId') || request.headers.get('x-admin-id');
    const adminPw = searchParams.get('adminPw') || request.headers.get('x-admin-pw');

    if (adminId !== ADMIN_ID || adminPw !== ADMIN_PW) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: '삭제할 리워드 ID가 필요합니다.' },
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

    const result = await db.collection('rewards').deleteOne({
      $or: [{ id }, { _id: id as any }],
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: '삭제할 대상을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '리워드 지급 내역이 삭제되었습니다.',
    });
  } catch (error: any) {
    console.error('Failed to delete reward:', error);
    return NextResponse.json(
      { success: false, message: '리워드 삭제 실패', error: error.message },
      { status: 500 }
    );
  }
}
