import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { RewardItem, OnChainSnapshot } from '@/types/meal';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

/**
 * 업비트 API를 통해 특정 시점(또는 최근)의 SOL 원화(KRW) 시세 조회
 */
async function fetchUpbitSolPrice(timestampSec?: number): Promise<{ price: number; dateStr: string } | null> {
  try {
    if (timestampSec) {
      const dt = new Date(timestampSec * 1000).toISOString();

      // 1. 60분봉 캔들 조회 (가장 근접한 시간대 시세)
      try {
        const minResp = await fetch(
          `https://api.upbit.com/v1/candles/minutes/60?market=KRW-SOL&to=${dt}&count=1`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (minResp.ok) {
          const data = await minResp.json();
          if (Array.isArray(data) && data[0]?.trade_price) {
            return {
              price: data[0].trade_price,
              dateStr: data[0].candle_date_time_kst?.replace('T', ' ') || '',
            };
          }
        }
      } catch (e) {}

      // 2. 일봉 캔들 조회 (날짜 기준)
      try {
        const dayResp = await fetch(
          `https://api.upbit.com/v1/candles/days?market=KRW-SOL&to=${dt}&count=1`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (dayResp.ok) {
          const data = await dayResp.json();
          if (Array.isArray(data) && data[0]?.trade_price) {
            return {
              price: data[0].trade_price,
              dateStr: data[0].candle_date_time_kst?.substring(0, 10) || '',
            };
          }
        }
      } catch (e) {}
    }

    // 3. Fallback: 현재 업비트 실시간 시세
    const tickerResp = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-SOL', {
      signal: AbortSignal.timeout(3000),
    });
    if (tickerResp.ok) {
      const data = await tickerResp.json();
      if (Array.isArray(data) && data[0]?.trade_price) {
        return {
          price: data[0].trade_price,
          dateStr: '실시간 시세',
        };
      }
    }
  } catch (err) {
    console.warn('Failed to query Upbit SOL price:', err);
  }
  return null;
}

/**
 * 솔라나 RPC를 통해 온체인 트랜잭션 영구 증빙 스냅샷 추출 및 업비트 환산 가치 계산
 */
async function fetchSolanaTxSnapshot(txHash: string, registeredAmount?: number): Promise<OnChainSnapshot | null> {
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
        let transferredLamports = 0;

        // 1. 최상위 transfer 명령어 탐색
        const instructions = res.transaction?.message?.instructions || [];
        for (const inst of instructions) {
          if (inst.parsed?.type === 'transfer' && inst.parsed?.info) {
            if (inst.parsed.info.destination && !recipient) {
              recipient = inst.parsed.info.destination;
            }
            if (inst.parsed.info.lamports) {
              transferredLamports += Number(inst.parsed.info.lamports);
            }
          }
        }

        // 2. 내부 명령어(innerInstructions) 탐색 (CPI 호출 등)
        const innerInstructions = res.meta?.innerInstructions || [];
        for (const inner of innerInstructions) {
          for (const inst of inner.instructions || []) {
            if (inst.parsed?.type === 'transfer' && inst.parsed?.info) {
              if (inst.parsed.info.destination && !recipient) {
                recipient = inst.parsed.info.destination;
              }
              if (transferredLamports === 0 && inst.parsed.info.lamports) {
                transferredLamports = Number(inst.parsed.info.lamports);
              }
            }
          }
        }

        if (!recipient && keys.length > 1) {
          recipient = typeof keys[1] === 'string' ? keys[1] : keys[1]?.pubkey || '';
        }

        // 3. 수신자 계정 잔액 변화량 계산 (보조 확인)
        if (transferredLamports === 0 && recipient && res.meta?.preBalances && res.meta?.postBalances) {
          const recIdx = keys.findIndex((k: any) =>
            (typeof k === 'string' ? k : k?.pubkey) === recipient
          );
          if (recIdx !== -1) {
            const diff = res.meta.postBalances[recIdx] - res.meta.preBalances[recIdx];
            if (diff > 0) {
              transferredLamports = diff;
            }
          }
        }

        // 실제로 전송된 SOL 수량 판단
        let transferredSol: number | undefined = undefined;
        let transferredSolFormatted: string | undefined = undefined;

        if (transferredLamports > 0) {
          transferredSol = transferredLamports / 1e9;
        } else if (registeredAmount && registeredAmount > 0) {
          transferredSol = registeredAmount;
        }

        if (transferredSol !== undefined && transferredSol > 0) {
          if (transferredSol >= 0.001) {
            transferredSolFormatted = `${parseFloat(transferredSol.toFixed(4))} SOL`;
          } else {
            transferredSolFormatted = `${parseFloat(transferredSol.toFixed(9))} SOL`;
          }
        }

        // 업비트 시세 조회 및 한화 환산 가치 계산
        let upbitSolPriceKrw: number | undefined = undefined;
        let upbitSolPriceFormatted: string | undefined = undefined;
        let approxKrwValue: string | undefined = undefined;
        let priceReferenceDate: string | undefined = undefined;

        const upbitInfo = await fetchUpbitSolPrice(blockTime);
        if (upbitInfo && transferredSol && transferredSol > 0) {
          upbitSolPriceKrw = upbitInfo.price;
          upbitSolPriceFormatted = `${upbitInfo.price.toLocaleString('ko-KR')}원`;
          priceReferenceDate = upbitInfo.dateStr;

          const krw = transferredSol * upbitInfo.price;
          if (krw >= 100) {
            approxKrwValue = `약 ${Math.round(krw).toLocaleString('ko-KR')}원`;
          } else if (krw >= 1) {
            approxKrwValue = `약 ${krw.toFixed(1)}원`;
          } else {
            approxKrwValue = `약 ${krw.toFixed(2)}원`;
          }
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
          transferredSol,
          transferredSolFormatted,
          upbitSolPriceKrw,
          upbitSolPriceFormatted,
          approxKrwValue,
          priceReferenceDate,
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
    const numAmount = parseFloat(String(amount)) || 0;
    try {
      snapshot = await fetchSolanaTxSnapshot(cleanTxHash, numAmount);
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
        const snap = await fetchSolanaTxSnapshot(cleanTx, updateFields.amount);
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

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({ success: false, message: 'DB 연결 실패' }, { status: 500 });
    }

    const currentDoc = await db.collection('rewards').findOne({ $or: [{ id }, { _id: id as any }] });
    const registeredAmount = currentDoc?.amount;

    const snapshot = await fetchSolanaTxSnapshot(txHash.trim(), registeredAmount);
    if (!snapshot) {
      return NextResponse.json(
        { success: false, message: '솔라나 RPC에서 해당 트랜잭션을 찾지 못했습니다.' },
        { status: 404 }
      );
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
