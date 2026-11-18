'use client';

import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';

interface ModelHealthItem {
  id: string;
  order: number;
  displayName: string;
  shortName: string;
  status: 'healthy' | 'unhealthy';
  latencyMs: number | null;
  checkedAt: number;
  error?: string;
}

interface ModelHealthResponse {
  success: boolean;
  checkedAt: number;
  models: ModelHealthItem[];
  cached?: boolean;
}

export function ModelHealthBar() {
  const [data, setData] = useState<ModelHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async (force = false) => {
    try {
      setLoading(true);
      const url = force ? '/api/model-health?force=true' : '/api/model-health';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch model health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth(false);
    // 30분마다 상태 동기화 확인
    const interval = setInterval(() => {
      fetchHealth(false);
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const models: ModelHealthItem[] = data?.models || [
    {
      id: 'stepfun-ai/step-5-preview',
      order: 1,
      displayName: 'stepfun-ai/step-5-preview',
      shortName: 'Step 5 Preview',
      status: 'healthy',
      latencyMs: 36000,
      checkedAt: 0,
    },
    {
      id: 'mistralai/mistral-large-4-1t-a52b',
      order: 2,
      displayName: 'mistralai/mistral-large-4-1t-a52b',
      shortName: 'Mistral',
      status: 'healthy',
      latencyMs: 4200,
      checkedAt: 0,
    },
    {
      id: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      order: 3,
      displayName: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      shortName: 'Nemotron',
      status: 'healthy',
      latencyMs: 500,
      checkedAt: 0,
    },
  ];

  const formatTimeAgo = (ts: number) => {
    if (!ts) return '확인 중';
    const diffMins = Math.floor((Date.now() - ts) / (60 * 1000));
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}시간 전`;
  };

  return (
    /* 모바일 뷰에서는 헬스체크 영역 숨김 (hidden sm:block으로 데스크톱에서만 깔끔하게 노출) */
    <div className="hidden sm:block w-full">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-slate-900/70 border border-slate-800/80 rounded-xl text-xs backdrop-blur-sm shadow-sm transition-all">
        <div className="flex items-center space-x-2 shrink-0">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-slate-300">모델 응답 상황</span>
          <span className="text-[10px] text-slate-500 font-mono">(3시간 점검)</span>
        </div>

        <div className="flex items-center space-x-4 lg:space-x-6 overflow-x-auto scrollbar-none py-0.5">
          {models.map((m) => {
            const isHealthy = m.status === 'healthy';
            return (
              <div
                key={m.id}
                className="flex items-center space-x-1.5 shrink-0"
                title={
                  isHealthy
                    ? `${m.displayName}: 정상 응답 (${m.latencyMs ? `${Math.round(m.latencyMs / 1000 * 10) / 10}s` : '정상'})`
                    : `${m.displayName}: ${m.error || '응답 지연 또는 미응답'}`
                }
              >
                <span className="text-slate-400 font-semibold">{m.order}.</span>
                <span className="font-mono text-slate-200">{m.displayName}</span>
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isHealthy
                      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/60'
                      : 'bg-rose-500 shadow-sm shadow-rose-500/60'
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 shrink-0">
          {data?.checkedAt && (
            <span className="text-slate-400 font-mono">{formatTimeAgo(data.checkedAt)} 점검</span>
          )}
          <button
            type="button"
            onClick={() => fetchHealth(true)}
            disabled={loading}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            title="AI 모델 헬스체크 즉시 다시 점검"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
