import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NIM_API_URL = process.env.NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

// 3시간 캐시 유지 (3 * 60 * 60 * 1000 ms)
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

export interface ModelHealthItem {
  id: string;
  order: number;
  displayName: string;
  shortName: string;
  status: 'healthy' | 'unhealthy';
  latencyMs: number | null;
  checkedAt: number;
  error?: string;
}

const TARGET_MODELS = [
  {
    order: 1,
    id: 'mistralai/mistral-large-4-1t-a52b',
    displayName: 'mistralai/mistral-large-4-1t-a52b',
    shortName: 'Mistral Large',
  },
  {
    order: 2,
    id: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    displayName: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    shortName: 'Nemotron 3.5',
  },
  {
    order: 3,
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    displayName: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    shortName: 'Nemotron Omni',
  },
];

// In-memory fallback cache
let memoryCache: { checkedAt: number; models: ModelHealthItem[] } | null = null;
let isChecking = false;

async function checkSingleModel(modelDef: typeof TARGET_MODELS[0]): Promise<ModelHealthItem> {
  const startTime = Date.now();
  if (!NVIDIA_API_KEY) {
    return {
      id: modelDef.id,
      order: modelDef.order,
      displayName: modelDef.displayName,
      shortName: modelDef.shortName,
      status: 'unhealthy',
      latencyMs: null,
      checkedAt: startTime,
      error: 'NVIDIA_API_KEY 누락',
    };
  }

  const payload: Record<string, any> = {
    model: modelDef.id,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 10,
    stream: false,
    temperature: 0.3,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(NIM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      return {
        id: modelDef.id,
        order: modelDef.order,
        displayName: modelDef.displayName,
        shortName: modelDef.shortName,
        status: 'healthy',
        latencyMs,
        checkedAt: Date.now(),
      };
    } else {
      const errText = await resp.text().catch(() => '');
      return {
        id: modelDef.id,
        order: modelDef.order,
        displayName: modelDef.displayName,
        shortName: modelDef.shortName,
        status: 'unhealthy',
        latencyMs: null,
        checkedAt: Date.now(),
        error: `HTTP ${resp.status}: ${errText.slice(0, 80)}`,
      };
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timeout') || err?.message?.includes('aborted');
    return {
      id: modelDef.id,
      order: modelDef.order,
      displayName: modelDef.displayName,
      shortName: modelDef.shortName,
      status: 'unhealthy',
      latencyMs: null,
      checkedAt: Date.now(),
      error: isTimeout ? '응답 타임아웃' : (err?.message || '연결 실패'),
    };
  }
}

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === 'true';
  const now = Date.now();

  try {
    const db = await getDatabase().catch(() => null);

    // 1. DB 캐시 확인 (최근 3시간 이내 점검 기록)
    if (!force) {
      if (db) {
        const cachedDoc = await db.collection('model_health').findOne({ _id: 'nim_models_health' as any });
        if (cachedDoc && cachedDoc.checkedAt && now - cachedDoc.checkedAt < CACHE_TTL_MS) {
          return NextResponse.json({
            success: true,
            checkedAt: cachedDoc.checkedAt,
            models: cachedDoc.models,
            cached: true,
            nextCheckInMs: CACHE_TTL_MS - (now - cachedDoc.checkedAt),
          });
        }
      } else if (memoryCache && now - memoryCache.checkedAt < CACHE_TTL_MS) {
        return NextResponse.json({
          success: true,
          checkedAt: memoryCache.checkedAt,
          models: memoryCache.models,
          cached: true,
          nextCheckInMs: CACHE_TTL_MS - (now - memoryCache.checkedAt),
        });
      }
    }

    // 동시 중복 점검 방지
    if (isChecking && (memoryCache || db)) {
      if (memoryCache) {
        return NextResponse.json({
          success: true,
          checkedAt: memoryCache.checkedAt,
          models: memoryCache.models,
          cached: true,
          inProgress: true,
        });
      }
    }

    isChecking = true;

    // 2. 3개 모델 병렬 헬스체크 실행
    const results = await Promise.all(TARGET_MODELS.map((m) => checkSingleModel(m)));
    isChecking = false;

    // 3. 캐시 저장 (DB 및 Memory)
    memoryCache = {
      checkedAt: now,
      models: results,
    };

    if (db) {
      await db.collection('model_health').updateOne(
        { _id: 'nim_models_health' as any },
        {
          $set: {
            checkedAt: now,
            models: results,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      checkedAt: now,
      models: results,
      cached: false,
      nextCheckInMs: CACHE_TTL_MS,
    });
  } catch (error: any) {
    isChecking = false;
    console.error('Model health check error:', error);
    // 캐시가 있다면 캐시 반환
    if (memoryCache) {
      return NextResponse.json({
        success: true,
        checkedAt: memoryCache.checkedAt,
        models: memoryCache.models,
        cached: true,
        warning: 'Fallback to memory cache due to check error',
      });
    }
    return NextResponse.json(
      { success: false, message: '모델 헬스체크 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
