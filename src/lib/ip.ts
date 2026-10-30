import { NextRequest } from 'next/server';

/**
 * 클라이언트의 실제 IP 주소 추출
 * Vercel, Cloudflare, Nginx 등 프록시 환경의 다양한 헤더 탐색
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const reqIp = (request as any).ip;
  if (reqIp) return String(reqIp).trim();

  return '127.0.0.1';
}

/**
 * 디시인사이드 스타일 IP 마스킹: 앞 2개 옥텟만 표시
 * 예시: 211.123.123.123 -> 211.123
 */
export function maskIp(ip?: string | null): string {
  if (!ip) return '';
  let cleanIp = ip.trim();

  // IPv6 매핑 IPv4 (::ffff:211.123.123.123) 접두사 제거
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // IPv4 포맷: a.b.c.d (또는 기존 마스킹 a.b.X.X)
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`;
    }
  }

  // IPv6 포맷: a:b:c:d:...
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
  }

  return cleanIp;
}
