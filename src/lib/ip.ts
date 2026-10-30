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
 * 디시인사이드 스타일 IP 마스킹: 뒤 2개의 옥텟 가리기
 * 예시: 211.123.123.123 -> 211.123.X.X
 */
export function maskIp(ip?: string | null): string {
  if (!ip) return '';
  let cleanIp = ip.trim();

  // IPv6 매핑 IPv4 (::ffff:211.123.123.123) 접두사 제거
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // IPv4 포맷: a.b.c.d
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.X.X`;
    }
  }

  // IPv6 포맷: a:b:c:d:...
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:X:X`;
    }
  }

  return cleanIp;
}
