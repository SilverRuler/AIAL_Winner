import exifr from 'exifr';
import { MealSlot } from '@/types/meal';
import { getKSTNow } from '@/constants/members';

export interface ExifValidationResult {
  hasExif: boolean;
  isValid: boolean;
  photoDate?: string; // YYYY-MM-DD
  photoTime?: string; // HH:mm
  sourceType?: 'camera' | 'live_camera' | 'kakaotalk'; // 스마트폰 카메라 원본, 실시간 카메라 직접 촬영, 카카오톡 시간검증
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
// 1) kakaotalk, kakao (소문자/대문자)
// 2) 안드로이드 카카오톡 저장 기본 파일명 (예: 1794219498732.jpg)
// 3) 파일명 내 13자리 Unix ms 타임스탬프
const KAKAOTALK_FILENAME_REGEX = /(kakaotalk|kakao)/i;
const KAKAO_NUMERIC_FILENAME_REGEX = /^1[6-9]\d{11}\.(jpe?g|png|webp)$/i;
const KAKAO_TS_FILENAME_REGEX = /(?:^|\D)(1[6-9]\d{11})(?:\D|$)/i;

export interface KakaoTimestampInfo {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  hour: number;
  minute: number;
  timestamp: number;
}

/**
 * 카카오톡 파일명에서 날짜/시간 또는 13자리 Unix 타임스탬프를 역추적 파싱 (KST 기준)
 */
export function parseKakaoFilenameTimestamp(fileName: string): KakaoTimestampInfo | null {
  if (!fileName) return null;

  // 1) KakaoTalk_YYYYMMDD_HHMMSS... 형태 (예: KakaoTalk_20261118_123456789.jpg)
  const ymdMatch = fileName.match(
    /(?:kakao|kakaotalk).*?(20[2-3]\d)[-_ ]?([01]\d)[-_ ]?([0-3]\d)[-_ ]([0-2]\d)[-_ ]?([0-5]\d)(?:[-_ ]?([0-5]\d))?/i
  );
  if (ymdMatch) {
    const [, y, m, d, h, min] = ymdMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    const hour = parseInt(h, 10);
    const minute = parseInt(min, 10);

    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      const dateStr = `${y}-${m}-${d}`;
      const timeStr = `${h}:${min}`;
      const dt = new Date(`${dateStr}T${timeStr}:00+09:00`);
      return {
        date: dateStr,
        time: timeStr,
        hour,
        minute,
        timestamp: dt.getTime(),
      };
    }
  }

  // 2) 13자리 Unix ms 타임스탬프 형태 (예: 1794978876123.jpg, KakaoTalk_1794978876123.jpg)
  const tsMatch = fileName.match(/(?:^|\D)(1[6-9]\d{11})(?:\D|$)/i);
  if (tsMatch) {
    const ts = parseInt(tsMatch[1], 10);
    // 2024년 ~ 2035년 범위 유효성 체크
    if (ts >= 1700000000000 && ts <= 2050000000000) {
      const d = new Date(ts);
      // 한국 표준시(KST)로 변환
      const kstFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = kstFormatter.formatToParts(d);
      const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
      const hourStr = getPart('hour');
      const minStr = getPart('minute');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);

      return {
        date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
        time: `${hourStr}:${minStr}`,
        hour,
        minute,
        timestamp: ts,
      };
    }
  }

  return null;
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
 * 이미지 파일에서 EXIF 및 메타데이터를 추출하여
 * 1) 파일명 및 비율 기반 스크린샷 차단
 * 2) 카카오톡 저장 사진(파일명 또는 EXIF 결여) 엄격 차단
 * 3) 스마트폰 기본 카메라 원본 사진의 하드웨어 태그 및 촬영 일자(오늘) / 타임대(아침/점심/저녁) 허용 범위를 정밀 검증합니다.
 * (관리자 로그인 시에만 해당 제약을 우회하여 모든 사진을 등록할 수 있습니다.)
 */
export async function validateMealImageExif(
  file: File,
  targetDate: string,
  targetSlot: MealSlot,
  isDirectCamera?: boolean
): Promise<ExifValidationResult> {
  const fileName = file.name || '';

  // 1. 파일명 기반 스크린샷 1차 차단
  if (fileName && SCREENSHOT_FILENAME_REGEX.test(fileName)) {
    return {
      hasExif: false,
      isValid: false,
      isScreenshot: true,
      errorMessage: '스크린샷(화면 캡처) 사진은 등록할 수 없습니다. 스마트폰 기본 카메라로 직접 촬영한 원본 사진을 올려주세요.',
    };
  }

  // 2. 스마트폰 전체 화면 캡처 특유의 종횡비(Aspect Ratio 2.08:1 이상) 검사 (스크린샷 전송 꼼수 방지)
  try {
    const dims = await getImageDimensions(file);
    if (dims && dims.width > 0 && dims.height > 0) {
      const ratio = Math.max(dims.width, dims.height) / Math.min(dims.width, dims.height);
      // 일반 카메라 사진은 4:3 (1.33) 또는 16:9 (1.78). 2.08 이상은 19.5:9 등 스마트폰 화면 전체 캡처
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

  // 3. 카카오톡 촬영/저장 사진 검증 (방안 A: 파일명 타임스탬프 역추적 검증)
  // 카카오톡 내 카메라로 바로 촬영하여 전송/저장된 사진은 EXIF가 제거될 수 있으나,
  // 파일명에 포함된 날짜/시간 또는 타임스탬프(Unix ms)를 역추적하여
  // 오늘 날짜 및 해당 식사 타임대(±30분 버퍼)와 일치하면 실시간 촬영으로 인정합니다.
  const isKakaoFile =
    fileName &&
    (KAKAOTALK_FILENAME_REGEX.test(fileName) ||
      KAKAO_NUMERIC_FILENAME_REGEX.test(fileName) ||
      KAKAO_TS_FILENAME_REGEX.test(fileName));

  if (isKakaoFile) {
    const kakaoTimeInfo = parseKakaoFilenameTimestamp(fileName);

    if (kakaoTimeInfo) {
      const { date: photoDate, time: photoTime, hour, minute } = kakaoTimeInfo;

      // 1) 날짜 일치 검증 (오늘 식사 날짜인지 확인)
      if (photoDate !== targetDate) {
        return {
          hasExif: true,
          isValid: false,
          photoDate,
          photoTime,
          errorMessage: `카카오톡 사진의 촬영/전송 일자(${photoDate})가 오늘 식사 일자(${targetDate})와 일치하지 않습니다.`,
        };
      }

      // 2) 식사 타임대(±30분 버퍼) 일치 검증
      if (!isWithinMealSlot(targetSlot, hour, minute)) {
        return {
          hasExif: true,
          isValid: false,
          photoDate,
          photoTime,
          errorMessage: `카카오톡 사진의 촬영/전송 시각(${photoTime})이 ${targetSlot} 식사 타임대 범위가 아닙니다.`,
        };
      }

      // 3) 검증 통과: 카카오톡 실시간 촬영 인정
      return {
        hasExif: true,
        isValid: true,
        sourceType: 'kakaotalk',
        photoDate,
        photoTime,
      };
    }

    // 파일명에서 타임스탬프를 파싱하지 못한 카카오톡 파일인 경우 file.lastModified 보조 확인
    if (file.lastModified) {
      const lastModDate = new Date(file.lastModified);
      const kstFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = kstFormatter.formatToParts(lastModDate);
      const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
      const lDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
      const lHourStr = getPart('hour');
      const lMinStr = getPart('minute');
      const lHour = parseInt(lHourStr, 10);
      const lMin = parseInt(lMinStr, 10);

      if (lDate === targetDate && isWithinMealSlot(targetSlot, lHour, lMin)) {
        return {
          hasExif: true,
          isValid: true,
          sourceType: 'kakaotalk',
          photoDate: lDate,
          photoTime: `${lHourStr}:${lMinStr}`,
        };
      }
    }

    return {
      hasExif: false,
      isValid: false,
      errorMessage:
        '카카오톡 저장 사진에서 유효한 촬영 시간 정보를 확인할 수 없습니다. 오늘 식사 시간대에 촬영된 카카오톡 원본 파일을 올려주세요.',
    };
  }

  // 4. 모바일/아이폰 브라우저 실시간 직접 촬영(Live Camera Capture) 처리
  // iOS Safari의 '사진 찍기' 및 HTML5 capture="environment"는 개인정보 보호 및 샌드박스 정책상
  // WebKit이 생성하는 임시 파일(image.jpg 등)에서 EXIF 하드웨어 메타데이터를 전면 제거합니다.
  // 따라서 전용 실시간 촬영 버튼(isDirectCamera)을 통해 유입되었거나,
  // 모바일 환경에서 방금 촬영된 live camera 파일(image.jpg 등, 60초 이내 생성)인 경우
  // 현재 한국 표준시(KST)를 기준으로 식사 타임대를 즉시 정밀 검증하여 승인합니다.
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent || '') ||
      (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1));

  const isLiveShotFile =
    Boolean(isDirectCamera) ||
    (isMobileDevice &&
      /^image\.(jpe?g|png)$/i.test(fileName) &&
      Math.abs(Date.now() - file.lastModified) <= 60 * 1000);

  if (isLiveShotFile) {
    const kst = getKSTNow();

    // 촬영 날짜 일치 검증 (실시간 촬영은 KST 오늘 날짜에만 허용)
    if (kst.date !== targetDate) {
      return {
        hasExif: true,
        isValid: false,
        photoDate: kst.date,
        photoTime: kst.time,
        errorMessage: `실시간 촬영 등록은 오늘(${kst.date}) 식사 타임에만 가능합니다. (선택된 날짜: ${targetDate})`,
      };
    }

    // 식사 타임대(±30분 버퍼) 일치 검증
    if (!isWithinMealSlot(targetSlot, kst.hour, kst.minute)) {
      return {
        hasExif: true,
        isValid: false,
        photoDate: kst.date,
        photoTime: kst.time,
        errorMessage: `현재 시각(${kst.time})은 ${targetSlot} 식사 타임대가 아닙니다.`,
      };
    }

    // 실시간 직접 촬영 승인 완료
    return {
      hasExif: true,
      isValid: true,
      sourceType: 'live_camera',
      photoDate: kst.date,
      photoTime: kst.time,
    };
  }

  // 5. 일반 앨범/갤러리 원본 사진 검증 (EXIF 파싱)
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

    // 웹 다운로드, 편집 사진, EXIF 누락 사진 차단
    // 💡 카메라 원본 EXIF 또는 앞선 카카오톡 시간 역추적 검증을 통과한 사진만 업로드할 수 있습니다.
    if (!exifData || !rawDate) {
      return {
        hasExif: false,
        isValid: false,
        errorMessage: '카메라 원본 촬영 정보(EXIF)가 없습니다. 스마트폰 기본 카메라로 직접 촬영한 원본 사진이나 카카오톡에서 저장된 사진을 올려주세요.',
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

    // 카메라 하드웨어 및 광학 센서 정보 검증 (카메라 원본 증명)
    // Make(제조사: Apple, Samsung 등), Model(기기명), 조리개(FNumber), 셔터속도(ExposureTime), 감도(ISO), 초점거리(FocalLength)
    const hasCameraHardware = Boolean(
      exifData.Make ||
      exifData.Model ||
      exifData.FNumber !== undefined ||
      exifData.ExposureTime !== undefined ||
      exifData.ISO !== undefined ||
      exifData.FocalLength !== undefined
    );

    if (!hasCameraHardware) {
      return {
        hasExif: false,
        isValid: false,
        errorMessage: '카메라 하드웨어 촬영 정보가 확인되지 않습니다. 스마트폰 카메라 원본 사진이나 시간 정보가 포함된 카카오톡 사진을 올려주세요.',
      };
    }

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
      errorMessage: '사진 메타데이터 분석 중 오류가 발생했습니다. 스마트폰 기본 카메라 원본 사진으로 다시 시도해주세요.',
    };
  }
}
