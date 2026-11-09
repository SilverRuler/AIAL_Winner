import exifr from 'exifr';
import { MealSlot } from '@/types/meal';

export interface ExifValidationResult {
  hasExif: boolean;
  isValid: boolean;
  photoDate?: string; // YYYY-MM-DD
  photoTime?: string; // HH:mm
  sourceType?: 'camera' | 'kakaotalk' | 'live_camera'; // 사진 식별 출처
  errorMessage?: string;
  isScreenshot?: boolean;
}

// 스크린샷 파일명 감지 패턴 (안드로이드, iOS, 윈도우, 맥 공통)
const SCREENSHOT_FILENAME_REGEX =
  /(screenshot|screen_shot|screen shot|screen-shot|스크린샷|화면캡처|화면_캡처|화면 캡처|screencapture)/i;

// 스크린샷 소프트웨어 감지 패턴
const SCREENSHOT_SOFTWARE_REGEX =
  /(screenshot|screen capture|screencapture|snipping tool|snip|lightshot|sharex)/i;

// 카카오톡 파일명 감지 패턴
const KAKAOTALK_FILENAME_REGEX = /kakaotalk|kakao/i;

// 1) KakaoTalk_20261105_091530123.jpg, KakaoTalk_Photo_20261105_091530.jpg 등
const KAKAO_FORMATTED_REGEX =
  /(?:kakaotalk|kakao).*?(20\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2})/i;

// 2) kakaotalk_1730763849123.jpg (13자리 ms Unix 타임스탬프)
const KAKAO_TS_REGEX = /(?:kakaotalk|kakao).*?([12]\d{12})/i;

/**
 * 타임스탬프(ms)를 한국 표준시(KST: UTC+9) 기준 날짜/시간으로 변환
 */
function formatTimestampToKST(ts: number): {
  photoDate: string;
  photoTime: string;
  hours: number;
  minutes: number;
} {
  const dateObj = new Date(ts);
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const kstDate = new Date(utc + 9 * 60 * 60 * 1000);

  const y = kstDate.getFullYear();
  const m = String(kstDate.getMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getDate()).padStart(2, '0');
  const h = String(kstDate.getHours()).padStart(2, '0');
  const min = String(kstDate.getMinutes()).padStart(2, '0');

  return {
    photoDate: `${y}-${m}-${d}`,
    photoTime: `${h}:${min}`,
    hours: kstDate.getHours(),
    minutes: kstDate.getMinutes(),
  };
}

/**
 * 식사 타임대(±30분 버퍼) 허용 범위 검증
 */
function isWithinMealSlot(slot: MealSlot, hours: number, minutes: number): boolean {
  const totalMins = hours * 60 + minutes;
  let minAllowed = 0;
  let maxAllowed = 0;

  if (slot === '아침') {
    // 공식 05:00 ~ 10:00 (버퍼 04:30 ~ 10:30)
    minAllowed = 270;
    maxAllowed = 630;
  } else if (slot === '점심') {
    // 공식 11:00 ~ 13:30 (버퍼 10:30 ~ 14:00)
    minAllowed = 630;
    maxAllowed = 840;
  } else if (slot === '저녁') {
    // 공식 17:00 ~ 22:00 (버퍼 16:30 ~ 22:30)
    minAllowed = 990;
    maxAllowed = 1350;
  }

  return totalMins >= minAllowed && totalMins <= maxAllowed;
}

/**
 * 브라우저 환경에서 이미지의 원본 해상도(width, height)를 비동기로 측정
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof window === 'undefined' || !window.URL) return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * 이미지 파일에서 EXIF 및 파일 시스템 메타데이터를 추출하여
 * 1) 스크린샷 우회 등록 차단
 * 2) 카카오톡 저장 사진(선 업로드 후 다운로드) 정상 허용 및 타임 검증
 * 3) 카메라 원본 사진의 촬영 일자(오늘) 및 타임대(아침/점심/저녁) 허용 범위를 정밀 검증합니다.
 */
export async function validateMealImageExif(
  file: File,
  targetDate: string,
  targetSlot: MealSlot
): Promise<ExifValidationResult> {
  const fileName = file.name || '';

  // 1. 파일명 기반 스크린샷 1차 차단
  if (fileName && SCREENSHOT_FILENAME_REGEX.test(fileName)) {
    return {
      hasExif: false,
      isValid: false,
      isScreenshot: true,
      errorMessage: '스크린샷(화면 캡처) 사진은 등록할 수 없습니다. 카메라 원본 또는 카톡 저장 사진을 올려주세요.',
    };
  }

  // 2. 스마트폰 전체 화면 캡처 특유의 종횡비(Aspect Ratio 2.08:1 이상) 검사 (스크린샷 카톡 전송 꼼수 방지)
  try {
    const dims = await getImageDimensions(file);
    if (dims && dims.width > 0 && dims.height > 0) {
      const ratio = Math.max(dims.width, dims.height) / Math.min(dims.width, dims.height);
      // 일반 카메라/카톡 사진은 4:3 (1.33) 또는 16:9 (1.78). 2.08 이상은 19.5:9 등 스마트폰 화면 전체 캡처
      if (ratio >= 2.08) {
        return {
          hasExif: false,
          isValid: false,
          isScreenshot: true,
          errorMessage: '스마트폰 화면 캡처(스크린샷) 비율의 사진입니다. 카메라로 직접 촬영한 원본을 올려주세요.',
        };
      }
    }
  } catch {
    // 이미지 크기 추출 실패 시 다음 단계 진행
  }

  // 3. 카카오톡 다운로드 사진 판별 및 시간 복원
  // 카카오톡은 서버 전송 시 EXIF를 지우므로, 파일명 또는 lastModified에서 일시를 복원하여 해당 타임대인지 검증합니다.
  if (fileName && KAKAOTALK_FILENAME_REGEX.test(fileName)) {
    let photoDate = '';
    let photoTime = '';
    let hours = 0;
    let minutes = 0;

    // 3-1. 파일명 포맷: KakaoTalk_20261105_091530...
    const kakaoMatch = fileName.match(KAKAO_FORMATTED_REGEX);
    if (kakaoMatch) {
      const y = kakaoMatch[1];
      const m = kakaoMatch[2];
      const d = kakaoMatch[3];
      const h = kakaoMatch[4];
      const min = kakaoMatch[5];
      const mNum = parseInt(m, 10);
      const dNum = parseInt(d, 10);
      const hNum = parseInt(h, 10);
      const minNum = parseInt(min, 10);

      if (
        mNum >= 1 &&
        mNum <= 12 &&
        dNum >= 1 &&
        dNum <= 31 &&
        hNum >= 0 &&
        hNum <= 23 &&
        minNum >= 0 &&
        minNum <= 59
      ) {
        photoDate = `${y}-${m}-${d}`;
        photoTime = `${h}:${min}`;
        hours = hNum;
        minutes = minNum;
      }
    }

    // 3-2. 파일명 포맷: kakaotalk_1730763849123... (Unix 타임스탬프) 또는 lastModified
    if (!photoDate) {
      const tsMatch = fileName.match(KAKAO_TS_REGEX);
      if (tsMatch) {
        const ts = parseInt(tsMatch[1], 10);
        const kst = formatTimestampToKST(ts);
        photoDate = kst.photoDate;
        photoTime = kst.photoTime;
        hours = kst.hours;
        minutes = kst.minutes;
      } else if (file.lastModified && file.lastModified > 0) {
        // 3-3. 파일명에 시간이 명시되지 않은 카톡 저장 파일 (다운로드 시점 lastModified 활용)
        const kst = formatTimestampToKST(file.lastModified);
        photoDate = kst.photoDate;
        photoTime = kst.photoTime;
        hours = kst.hours;
        minutes = kst.minutes;
      }
    }

    if (!photoDate || !photoTime) {
      return {
        hasExif: false,
        isValid: false,
        errorMessage: '카카오톡 사진의 저장 일시를 확인할 수 없습니다.',
      };
    }

    // 날짜 일치 검증
    if (photoDate !== targetDate) {
      return {
        hasExif: false,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 저장된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 타임대 일치 검증
    if (!isWithinMealSlot(targetSlot, hours, minutes)) {
      return {
        hasExif: false,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 저장된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 카카오톡 저장 사진 검증 성공
    return {
      hasExif: true,
      isValid: true,
      sourceType: 'kakaotalk',
      photoDate,
      photoTime,
    };
  }

  // 4. 일반 카메라 원본 사진 검증 (EXIF 파싱)
  try {
    const exifData = await exifr
      .parse(file, {
        pick: [
          'DateTimeOriginal',
          'CreateDate',
          'ModifyDate',
          'Make',
          'Model',
          'Software',
          'FNumber',
          'ExposureTime',
          'ISO',
          'FocalLength',
        ],
        reviveValues: false,
      })
      .catch(() => null);

    const rawDate = exifData?.DateTimeOriginal || exifData?.CreateDate || exifData?.ModifyDate;

    // 카톡 사진도 아니고 EXIF 촬영 일시 정보도 없는 경우
    // 💡 iOS Safari 등 모바일 브라우저의 '사진 찍기'(인라인 카메라 촬영)는 WebKit 보안/개인정보 정책에 따라 EXIF 메타데이터가 자동 제거됩니다.
    // 대신 브라우저가 사진을 촬영/생성한 시각(file.lastModified)이 실시간으로 정확히 부여됩니다.
    if (!exifData || !rawDate) {
      if (file.lastModified && file.lastModified > 0) {
        const kst = formatTimestampToKST(file.lastModified);

        // 촬영 날짜 일치 검증
        if (kst.photoDate !== targetDate) {
          return {
            hasExif: false,
            isValid: false,
            photoDate: kst.photoDate,
            photoTime: kst.photoTime,
            errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${kst.photoDate} ${kst.photoTime}`,
          };
        }

        // 식사 타임대 일치 검증 (±30분 버퍼)
        if (!isWithinMealSlot(targetSlot, kst.hours, kst.minutes)) {
          return {
            hasExif: false,
            isValid: false,
            photoDate: kst.photoDate,
            photoTime: kst.photoTime,
            errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${kst.photoDate} ${kst.photoTime}`,
          };
        }

        // 실시간 카메라 직접 촬영본 승인!
        return {
          hasExif: true,
          isValid: true,
          sourceType: 'live_camera',
          photoDate: kst.photoDate,
          photoTime: kst.photoTime,
        };
      }

      return {
        hasExif: false,
        isValid: false,
        isScreenshot: true,
        errorMessage: '카메라 원본 촬영 정보(EXIF)가 없습니다. 스크린샷이 아닌 카메라 원본 사진을 올려주세요.',
      };
    }

    // Software 태그에 스크린샷 관련 흔적이 있는 경우 차단
    if (
      exifData.Software &&
      typeof exifData.Software === 'string' &&
      SCREENSHOT_SOFTWARE_REGEX.test(exifData.Software)
    ) {
      return {
        hasExif: true,
        isValid: false,
        isScreenshot: true,
        errorMessage: '스크린샷 도구로 캡처된 사진은 등록할 수 없습니다. 카메라로 직접 촬영한 원본을 올려주세요.',
      };
    }

    // 카메라 하드웨어/광학 센서 정보 검증
    // (일부 필터 카메라 앱이나 웹 브라우저 경유 사진은 Make/Model이 생략될 수 있으나,
    //  DateTimeOriginal/CreateDate 등 카메라 원본 일시가 유효하다면 통과시킴)

    // 촬영 일시(날짜 및 시각) 파싱
    let photoDate = '';
    let photoTime = '';
    let hours = 0;
    let minutes = 0;

    if (typeof rawDate === 'string') {
      const match = rawDate.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})\s+(\d{2}):(\d{2})/);
      if (match) {
        photoDate = `${match[1]}-${match[2]}-${match[3]}`;
        photoTime = `${match[4]}:${match[5]}`;
        hours = parseInt(match[4], 10);
        minutes = parseInt(match[5], 10);
      }
    } else if (rawDate instanceof Date) {
      const y = rawDate.getFullYear();
      const m = String(rawDate.getMonth() + 1).padStart(2, '0');
      const d = String(rawDate.getDate()).padStart(2, '0');
      const h = String(rawDate.getHours()).padStart(2, '0');
      const min = String(rawDate.getMinutes()).padStart(2, '0');
      photoDate = `${y}-${m}-${d}`;
      photoTime = `${h}:${min}`;
      hours = rawDate.getHours();
      minutes = rawDate.getMinutes();
    }

    if (!photoDate || !photoTime) {
      return {
        hasExif: false,
        isValid: false,
        errorMessage: '촬영 일시 형식을 확인할 수 없습니다. 카메라 원본 사진을 올려주세요.',
      };
    }

    // 촬영 날짜 일치 검증
    if (photoDate !== targetDate) {
      return {
        hasExif: true,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 식사 타임대 일치 검증
    if (!isWithinMealSlot(targetSlot, hours, minutes)) {
      return {
        hasExif: true,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 카메라 원본 검증 성공
    return {
      hasExif: true,
      isValid: true,
      sourceType: 'camera',
      photoDate,
      photoTime,
    };
  } catch (error) {
    console.error('EXIF extraction error:', error);
    return {
      hasExif: false,
      isValid: false,
      errorMessage: '사진 메타데이터 분석 중 오류가 발생했습니다. 카메라 원본 또는 카톡 저장 사진으로 다시 시도해주세요.',
    };
  }
}
