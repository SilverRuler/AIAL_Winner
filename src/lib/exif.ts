import exifr from 'exifr';
import { MealSlot } from '@/types/meal';

export interface ExifValidationResult {
  hasExif: boolean;
  isValid: boolean;
  photoDate?: string; // YYYY-MM-DD
  photoTime?: string; // HH:mm
  errorMessage?: string;
  isScreenshot?: boolean;
}

// 스크린샷 파일명 감지 패턴 (안드로이드, iOS, 윈도우, 맥 공통)
const SCREENSHOT_FILENAME_REGEX =
  /(screenshot|screen_shot|screen shot|screen-shot|스크린샷|화면캡처|화면_캡처|화면 캡처|screencapture)/i;

// 스크린샷 소프트웨어 감지 패턴
const SCREENSHOT_SOFTWARE_REGEX =
  /(screenshot|screen capture|screencapture|snipping tool|snip|lightshot|sharex)/i;

/**
 * 이미지 파일에서 EXIF 메타데이터 및 하드웨어 센서 정보를 추출하여
 * 1) 스크린샷(화면 캡처) 우회 시도 차단
 * 2) 촬영 날짜(오늘) 및 해당 식사 타임대(아침/점심/저녁) 허용 범위 일치 여부를 정밀 검증합니다.
 */
export async function validateMealImageExif(
  file: File,
  targetDate: string,
  targetSlot: MealSlot
): Promise<ExifValidationResult> {
  // 1. 파일명 기반 스크린샷 1차 차단
  if (file.name && SCREENSHOT_FILENAME_REGEX.test(file.name)) {
    return {
      hasExif: false,
      isValid: false,
      isScreenshot: true,
      errorMessage: '스크린샷(화면 캡처) 사진은 등록할 수 없습니다. 카메라 원본 사진을 올려주세요.',
    };
  }

  try {
    // 2. EXIF 촬영 일시 및 카메라 하드웨어/광학 센서 태그 파싱
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
        reviveValues: false, // 원본 "YYYY:MM:DD HH:MM:SS" 문자열 유지하여 타임존 왜곡 방지
      })
      .catch(() => null);

    // 3. EXIF 메타데이터 자체가 없거나 촬영 일시 정보가 없는 경우 -> 스크린샷 또는 메타데이터 삭제본으로 차단
    const rawDate = exifData?.DateTimeOriginal || exifData?.CreateDate || exifData?.ModifyDate;

    if (!exifData || !rawDate) {
      return {
        hasExif: false,
        isValid: false,
        isScreenshot: true,
        errorMessage: '카메라 원본 촬영 정보(EXIF)가 없습니다. 스크린샷이 아닌 카메라 원본 사진을 올려주세요.',
      };
    }

    // 4. Software 태그에 스크린샷 관련 흔적이 있는 경우 차단
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

    // 5. 카메라 하드웨어/광학 센서 정보 검증 (스크린샷 지능적 우회 차단)
    // 스마트폰/DSLR 카메라로 직접 촬영한 사진은 Make(제조사), Model(기종), FNumber(조리개), ExposureTime(셔터속도), ISO, FocalLength 중 최소 1개 이상 존재함
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
        hasExif: true,
        isValid: false,
        isScreenshot: true,
        errorMessage: '카메라 센서 정보가 없는 스크린샷 사진입니다. 카메라로 직접 촬영한 원본을 올려주세요.',
      };
    }

    // 6. 촬영 일시(날짜 및 시각) 파싱
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

    // 7. 촬영 날짜 일치 검증 (한국 시간 오늘 날짜)
    if (photoDate !== targetDate) {
      return {
        hasExif: true,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 8. 촬영 시간대(아침/점심/저녁) 검증 (±30분 버퍼)
    const photoTotalMins = hours * 60 + minutes;

    let minAllowed = 0;
    let maxAllowed = 0;

    if (targetSlot === '아침') {
      // 공식 05:00 ~ 10:00 (버퍼 04:30 ~ 10:30)
      minAllowed = 270;
      maxAllowed = 630;
    } else if (targetSlot === '점심') {
      // 공식 11:00 ~ 13:30 (버퍼 10:30 ~ 14:00)
      minAllowed = 630;
      maxAllowed = 840;
    } else if (targetSlot === '저녁') {
      // 공식 17:00 ~ 22:00 (버퍼 16:30 ~ 22:30)
      minAllowed = 990;
      maxAllowed = 1350;
    }

    if (photoTotalMins < minAllowed || photoTotalMins > maxAllowed) {
      return {
        hasExif: true,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 모든 검증 통과 (카메라 원본 & 당일 해당 타임대 확인 완료)
    return {
      hasExif: true,
      isValid: true,
      photoDate,
      photoTime,
    };
  } catch (error) {
    console.error('EXIF extraction error:', error);
    return {
      hasExif: false,
      isValid: false,
      errorMessage: '사진 메타데이터 분석 중 오류가 발생했습니다. 카메라 원본 사진으로 다시 시도해주세요.',
    };
  }
}
