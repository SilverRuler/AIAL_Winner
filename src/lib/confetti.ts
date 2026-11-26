import confetti from 'canvas-confetti';

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

function forceClearConfettiCanvases() {
  try {
    confetti.reset();
  } catch {}
  if (typeof document !== 'undefined') {
    document.querySelectorAll('body > canvas').forEach((el) => {
      const style = (el as HTMLCanvasElement).style;
      if (style.position === 'fixed' && style.pointerEvents === 'none') {
        el.remove();
      }
    });
  }
}

/**
 * 모바일/탭 전환/언마운트 시 폭죽 캔버스가 화면에 굳어 사라지지 않는 현상을 원천 방지하는 안전 래퍼
 */
export function fireSafeConfetti(opts: confetti.Options = {}, autoClearMs = 3400): void {
  if (typeof window === 'undefined') return;
  try {
    confetti({
      ticks: 160,
      disableForReducedMotion: true,
      ...opts,
    });
  } catch {}

  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    forceClearConfettiCanvases();
  }, autoClearMs);
}

export function clearSafeConfetti(): void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  forceClearConfettiCanvases();
}
