import exifr from 'exifr';
import { MealSlot } from '@/types/meal';

export interface ExifValidationResult {
  hasExif: boolean;
  isValid: boolean;
  photoDate?: string; // YYYY-MM-DD
  photoTime?: string; // HH:mm
  sourceType?: 'camera'; // 일반 유저는 오직 카메라 원본만 승인
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
const KAKAO_NUMERIC_FILENAME_REGEX = /^1[6789]\d{11}\.(jpe?g|png|webp)$/i;
const KAKAO_TS_FILENAME_REGEX = /(?:^|[_\-.])(1[6789]\d{11})(?:[_\-.]|\.[a-z]{3,4}$)/i;

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
  targetSlot: MealSlot
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

  // 3. 카카오톡 다운로드 사진 차단 (일반 사용자는 차단, 관리자만 모달에서 우회 허용)
  if (
    fileName &&
    (KAKAOTALK_FILENAME_REGEX.test(fileName) ||
      KAKAO_NUMERIC_FILENAME_REGEX.test(fileName) ||
      KAKAO_TS_FILENAME_REGEX.test(fileName))
  ) {
    return {
      hasExif: false,
      isValid: false,
      errorMessage: '카카오톡 저장(다운로드) 사진은 등록할 수 없습니다. 스마트폰 기본 카메라로 직접 촬영한 원본 사진만 등록 가능합니다.',
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

    // 카톡 다운로드, 웹 다운로드, 편집 사진, EXIF 누락 사진 차단
    // 💡 카카오톡 등 메신저를 통해 전송/저장된 사진은 EXIF 메타데이터가 완전히 제거됩니다.
    // 일반 사용자는 오직 카메라 원본 EXIF가 온전히 보존된 사진만 업로드할 수 있습니다.
    if (!exifData || !rawDate) {
      return {
        hasExif: false,
        isValid: false,
        errorMessage: '카메라 원본 촬영 정보(EXIF)가 없습니다. 카카오톡 다운로드나 스크린샷이 아닌 스마트폰 기본 카메라로 직접 촬영한 원본 사진을 올려주세요.',
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
        errorMessage: '카메라 하드웨어 촬영 정보가 확인되지 않습니다. 카카오톡 다운로드나 변환된 사진이 아닌 스마트폰 카메라 원본 사진을 올려주세요.',
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
