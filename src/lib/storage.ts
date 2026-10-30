import { MealEntry, MemberWinStats } from '@/types/meal';
import { MEMBERS } from '@/constants/members';

const LOCAL_STORAGE_KEY = 'aial_winner_meals';

/**
 * 로컬스토리지에서 식사 일지 목록 불러오기 (DB 실패 또는 오프라인 대비)
 */
export function getLocalMeals(): MealEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error reading localStorage:', e);
    return [];
  }
}

/**
 * 로컬스토리지에 식사 일지 목록 저장하기
 */
export function saveLocalMeals(meals: MealEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meals));
  } catch (e) {
    console.error('Error writing to localStorage:', e);
  }
}

/**
 * 12인의 멤버별 총 등록 수, 승리(WIN) 횟수, 승률 통계 산출
 */
export function calculateMemberWinStats(meals: MealEntry[]): MemberWinStats[] {
  const statsMap: Record<string, { totalSubmissions: number; totalWins: number; lastWinDate?: string }> = {};

  // 초기화: 12인 전원 0승 등록
  for (const m of MEMBERS) {
    statsMap[m.name] = { totalSubmissions: 0, totalWins: 0 };
  }

  // 집계
  for (const entry of meals) {
    if (!statsMap[entry.member]) {
      statsMap[entry.member] = { totalSubmissions: 0, totalWins: 0 };
    }
    statsMap[entry.member].totalSubmissions += 1;

    if (entry.isWinner) {
      statsMap[entry.member].totalWins += 1;
      if (!statsMap[entry.member].lastWinDate || entry.date > statsMap[entry.member].lastWinDate!) {
        statsMap[entry.member].lastWinDate = entry.date;
      }
    }
  }

  // 배열 변환 및 승리 횟수 내림차순 정렬
  const result: MemberWinStats[] = Object.entries(statsMap).map(([member, stat]) => {
    const winRate = stat.totalSubmissions > 0
      ? Math.round((stat.totalWins / stat.totalSubmissions) * 100)
      : 0;
    return {
      member,
      totalSubmissions: stat.totalSubmissions,
      totalWins: stat.totalWins,
      winRate,
      lastWinDate: stat.lastWinDate,
    };
  });

  result.sort((a, b) => {
    if (b.totalWins !== a.totalWins) {
      return b.totalWins - a.totalWins;
    }
    if (b.winRate !== a.winRate) {
      return b.winRate - a.winRate;
    }
    return b.totalSubmissions - a.totalSubmissions;
  });

  return result;
}

/**
 * 클립보드 또는 파일 인풋에서 읽은 이미지를 적절한 크기와 품질로 압축하여 Data URL 반환
 * iOS Safari, Android, Desktop 등 모든 브라우저 및 고해상도 HEIC/JPEG 완벽 호환
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth = 1400,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    // 5초 타임아웃 방어 (브라우저나 파일 문제 발생 시에도 절대 멈추지 않음)
    const timeout = setTimeout(() => {
      const fallbackReader = new FileReader();
      fallbackReader.onload = () => resolve((fallbackReader.result as string) || '');
      fallbackReader.onerror = () => resolve('');
      fallbackReader.readAsDataURL(file);
    }, 4500);

    const reader = new FileReader();
    reader.onerror = () => {
      clearTimeout(timeout);
      resolve('');
    };

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        clearTimeout(timeout);
        return resolve('');
      }

      // GIF이거나 이미 용량이 작은 경우 (250KB 이하) 그대로 반환
      if (file.type === 'image/gif' || file.size < 250 * 1024) {
        clearTimeout(timeout);
        return resolve(dataUrl);
      }

      const img = new Image();
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(dataUrl);
      };

      img.onload = () => {
        clearTimeout(timeout);
        try {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(dataUrl);

          ctx.drawImage(img, 0, 0, width, height);
          // iOS Safari 및 모든 기기에서 100% 안전하게 동작하는 JPEG 형식으로 압축
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (e) {
          console.warn('[compressImage] Canvas compression failed, using original:', e);
          resolve(dataUrl);
        }
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 하위 호환용 compressImage 함수
 */
export async function compressImage(file: File, maxWidth = 1400, quality = 0.8): Promise<File> {
  const dataUrl = await compressImageToDataUrl(file, maxWidth, quality);
  if (!dataUrl || dataUrl === '') return file;
  try {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    return new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
      type: mime,
      lastModified: Date.now(),
    });
  } catch (e) {
    return file;
  }
}
