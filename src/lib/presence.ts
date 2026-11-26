import { NextRequest } from 'next/server';
import { getClientIp, maskIp, normalizeIp } from '@/lib/ip';
import { GACHA_SLOT_SHORT_LABELS } from '@/constants/gacha';

export type PresenceArea = 'main' | 'gacha' | 'maintenance';

export interface PresenceRecord {
  ip: string;
  maskedIp: string;
  area: PresenceArea;
  page: string;
  engine?: string;
  machineIndex?: number;
  member?: string;
  isPlaying: boolean;
  deviceType: 'Mobile' | 'PC';
  userAgentShort: string;
  firstSeenAt: number;
  lastSeenAt: number;
  hits: number;
}

export interface PresenceSessionView extends PresenceRecord {
  lastSeenAgoSec: number;
  staySec: number;
}

export interface PresenceSummary {
  serverNow: number;
  ttlSec: number;
  totalActive: number;
  playingCount: number;
  byArea: {
    main: number;
    gacha: number;
    maintenance: number;
  };
  sessions: PresenceSessionView[];
}

export const PRESENCE_TTL_MS = 25_000;

const g = globalThis as unknown as {
  __aialPresenceMap?: Map<string, PresenceRecord>;
  __aialPresenceLastPrune?: number;
};

function getPresenceMap(): Map<string, PresenceRecord> {
  if (!g.__aialPresenceMap) {
    g.__aialPresenceMap = new Map<string, PresenceRecord>();
  }
  return g.__aialPresenceMap;
}

function pruneExpired(now: number): void {
  const map = getPresenceMap();
  for (const [key, entry] of map.entries()) {
    if (now - entry.lastSeenAt > PRESENCE_TTL_MS) {
      map.delete(key);
    }
  }
  g.__aialPresenceLastPrune = now;
}

function parseDeviceInfo(uaRaw: string): { deviceType: 'Mobile' | 'PC'; userAgentShort: string } {
  const ua = uaRaw || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry/i.test(ua);
  const deviceType: 'Mobile' | 'PC' = isMobile ? 'Mobile' : 'PC';

  let os = 'Etc';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Win';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '';
  if (/KAKAOTALK/i.test(ua)) browser = 'Kakao';
  else if (/NAVER/i.test(ua)) browser = 'Naver';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Whale\//i.test(ua)) browser = 'Whale';
  else if (/CriOS|Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  const userAgentShort = browser ? `${os} ${browser}` : os;
  return { deviceType, userAgentShort };
}

export interface RecordPresenceInput {
  area: PresenceArea;
  page: string;
  engine?: string;
  machineIndex?: number;
  member?: string;
  isPlaying?: boolean;
  preserveRecentGachaMs?: number;
}

export function buildGachaPageLabel(
  engine?: string,
  machineIndex?: number,
  suspended?: boolean
): string {
  const eng = engine ? engine.trim().slice(0, 16) : 'Gacha';
  if (suspended) {
    return `${eng} (점검중)`;
  }
  if (typeof machineIndex === 'number' && Number.isInteger(machineIndex) && machineIndex >= 0) {
    const shortName = GACHA_SLOT_SHORT_LABELS[machineIndex] || `${machineIndex + 1}번`;
    return `${eng} #${machineIndex + 1} ${shortName}`;
  }
  return eng;
}

export function recordPresence(request: NextRequest, input: RecordPresenceInput): void {
  try {
    const rawIp = getClientIp(request);
    const ip = normalizeIp(rawIp);
    const ua = (request.headers.get('user-agent') || '').trim();

    // 내부 로컬 헬스체크/curl 요청 제외 (실제 접속자만 집계)
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return;
    }

    const now = Date.now();
    const map = getPresenceMap();
    const existing = map.get(ip);

    // GachaLiveChat 등 보조 폴링이 최근 뽑기방 접속 정보를 덮어쓰지 않도록 보호
    if (
      existing &&
      input.preserveRecentGachaMs &&
      existing.area === 'gacha' &&
      now - existing.lastSeenAt < input.preserveRecentGachaMs
    ) {
      existing.lastSeenAt = now;
      existing.hits += 1;
      return;
    }

    const { deviceType, userAgentShort } = parseDeviceInfo(ua);
    const cleanMember = input.member ? input.member.trim().slice(0, 20) : undefined;
    const isFreshSession = !existing || now - existing.lastSeenAt > PRESENCE_TTL_MS;

    const nextRecord: PresenceRecord = {
      ip,
      maskedIp: maskIp(ip) || ip,
      area: input.area,
      page: input.page.slice(0, 48),
      engine: input.engine ? input.engine.trim().slice(0, 16) : existing?.engine,
      machineIndex:
        typeof input.machineIndex === 'number' && Number.isInteger(input.machineIndex)
          ? input.machineIndex
          : input.area === 'gacha'
          ? existing?.machineIndex
          : undefined,
      member: cleanMember || (input.area === 'gacha' ? existing?.member : undefined),
      isPlaying: Boolean(input.isPlaying),
      deviceType,
      userAgentShort,
      firstSeenAt: isFreshSession ? now : existing.firstSeenAt,
      lastSeenAt: now,
      hits: isFreshSession ? 1 : existing.hits + 1,
    };

    map.set(ip, nextRecord);

    if (!g.__aialPresenceLastPrune || now - g.__aialPresenceLastPrune > 5_000) {
      pruneExpired(now);
    }
  } catch {
    // Presence tracking must never break primary API responses
  }
}

export function getActivePresenceCount(): number {
  const now = Date.now();
  pruneExpired(now);
  return getPresenceMap().size;
}

export function getActivePresenceSummary(): PresenceSummary {
  const now = Date.now();
  pruneExpired(now);

  const map = getPresenceMap();
  const byArea = { main: 0, gacha: 0, maintenance: 0 };
  let playingCount = 0;

  const sessions: PresenceSessionView[] = [];
  for (const entry of map.values()) {
    byArea[entry.area] = (byArea[entry.area] || 0) + 1;
    if (entry.isPlaying) playingCount += 1;
    sessions.push({
      ...entry,
      lastSeenAgoSec: Math.max(0, Math.floor((now - entry.lastSeenAt) / 1000)),
      staySec: Math.max(0, Math.floor((now - entry.firstSeenAt) / 1000)),
    });
  }

  sessions.sort((a, b) => {
    if (a.isPlaying !== b.isPlaying) return a.isPlaying ? -1 : 1;
    if (a.area !== b.area) {
      const order: Record<PresenceArea, number> = { gacha: 0, main: 1, maintenance: 2 };
      return order[a.area] - order[b.area];
    }
    return b.lastSeenAt - a.lastSeenAt;
  });

  return {
    serverNow: now,
    ttlSec: Math.round(PRESENCE_TTL_MS / 1000),
    totalActive: sessions.length,
    playingCount,
    byArea,
    sessions,
  };
}
