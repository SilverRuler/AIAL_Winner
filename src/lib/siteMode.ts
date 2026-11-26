import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export type WinSiteMode = 'dev' | 'normal' | 'unknown';

const ACTIVE_CONF = '/etc/nginx/sites-available/win.silverruler.xyz';
const MAINT_TEMPLATE = '/etc/nginx/sites-available/win.silverruler.xyz.maint';
const PROD_TEMPLATE = '/etc/nginx/sites-available/win.silverruler.xyz.prod';

export function getWinSiteMode(): WinSiteMode {
  try {
    if (!fs.existsSync(ACTIVE_CONF)) return 'unknown';
    const content = fs.readFileSync(ACTIVE_CONF, 'utf8');
    if (content.includes('/var/www/win-maintenance')) {
      return 'dev';
    }
    return 'normal';
  } catch {
    return 'unknown';
  }
}

export function switchWinSiteMode(target: 'dev' | 'normal'): {
  ok: boolean;
  mode: WinSiteMode;
  message: string;
} {
  const templatePath = target === 'dev' ? MAINT_TEMPLATE : PROD_TEMPLATE;

  if (!fs.existsSync(templatePath)) {
    return {
      ok: false,
      mode: getWinSiteMode(),
      message: `Nginx 템플릿 파일(${templatePath})을 찾을 수 없습니다.`,
    };
  }

  let prevContent: string | null = null;
  try {
    if (fs.existsSync(ACTIVE_CONF)) {
      prevContent = fs.readFileSync(ACTIVE_CONF, 'utf8');
    }
    const nextContent = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(ACTIVE_CONF, nextContent, 'utf8');

    // Nginx 문법 검증 (실패 시 즉시 롤백)
    execFileSync('/usr/sbin/nginx', ['-t'], { stdio: 'pipe', timeout: 10_000 });

    // 무중단 Nginx reload
    try {
      execFileSync('/usr/bin/systemctl', ['reload', 'nginx'], { stdio: 'pipe', timeout: 10_000 });
    } catch {
      execFileSync('/usr/sbin/nginx', ['-s', 'reload'], { stdio: 'pipe', timeout: 10_000 });
    }

    return {
      ok: true,
      mode: target,
      message:
        target === 'dev'
          ? 'win.silverruler.xyz가 개발 모드(점검중 페이지)로 전환되었습니다.'
          : 'win.silverruler.xyz가 일반 모드(정상 서비스)로 복귀되었습니다.',
    };
  } catch (err: any) {
    // 오류 시 이전 설정 복구
    if (prevContent !== null) {
      try {
        fs.writeFileSync(ACTIVE_CONF, prevContent, 'utf8');
      } catch {}
    }
    return {
      ok: false,
      mode: getWinSiteMode(),
      message: `Nginx 전환 실패 (롤백됨): ${err?.stderr?.toString?.() || err?.message || '알 수 없는 오류'}`,
    };
  }
}
