import exifr from 'exifr';
import { MealSlot } from '@/types/meal';

export interface ExifValidationResult {
  hasExif: boolean;
  isValid: boolean;
  photoDate?: string; // YYYY-MM-DD
  photoTime?: string; // HH:mm
  errorMessage?: string;
}

/**
 * 이미지 파일에서 EXIF 메타데이터(DateTimeOriginal, CreateDate, ModifyDate 등)를 추출하여
 * 등록하려는 식사 날짜 및 타임대(아침/점심/저녁)와 일치하는지 검증합니다.
 *
 * [1번 정책 적용]
 * - 카메라 원본 등 EXIF 촬영 일시 정보가 존재하는 사진:
 *   1) 촬영 날짜가 선택한 식사 날짜(오늘)와 일치해야 함
 *   2) 촬영 시간이 해당 식사 타임대 범위 내여야 함 (식사 전후 여유 버퍼 ±30분 포함)
 *   -> 일치하지 않으면 등록 거부 (isValid = false)
 *
 * - 메신저 다운로드(카카오톡, 텔레그램), 캡처본 등 EXIF 메타데이터가 없는 사진:
 *   -> 2번 정책 미적용(사용자 요청: "2번은 너무 까다로우니 1번만 도입")에 따라 유연하게 통과 (isValid = true, hasExif = false)
 */
export async function validateMealImageExif(
  file: File,
  targetDate: string,
  targetSlot: MealSlot
): Promise<ExifValidationResult> {
  try {
    // DateTimeOriginal, CreateDate, ModifyDate 파싱 (문자열 우선)
    const exifData = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
      reviveValues: false, // 원본 "YYYY:MM:DD HH:MM:SS" 문자열 유지하여 타임존 왜곡 방지
    }).catch(() => null);

    const rawDate = exifData?.DateTimeOriginal || exifData?.CreateDate || exifData?.ModifyDate;

    // EXIF 촬영 일시 정보가 없는 경우 -> 검증 통과 (1번 정책)
    if (!rawDate) {
      return {
        hasExif: false,
        isValid: true,
      };
    }

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

    // 날짜 파싱이 불가능한 포맷인 경우 강제 차단하지 않고 통과
    if (!photoDate || !photoTime) {
      return {
        hasExif: false,
        isValid: true,
      };
    }

    // 1. 촬영 날짜 일치 검증
    if (photoDate !== targetDate) {
      return {
        hasExif: true,
        isValid: false,
        photoDate,
        photoTime,
        errorMessage: `해당 타임대에 촬영된 사진이 아닙니다 : ${photoDate} ${photoTime}`,
      };
    }

    // 2. 촬영 시간대(아침/점심/저녁) 검증
    // - 식사 준비 및 촬영 편차를 감안하여 공식 시간 대비 전후 30분 여유 버퍼 허용
    const photoTotalMins = hours * 60 + minutes;

    let minAllowed = 0;
    let maxAllowed = 0;
    let slotDisplayRange = '';

    if (targetSlot === '아침') {
      // 공식 05:00 ~ 10:00 (버퍼 04:30 ~ 10:30)
      minAllowed = 270;
      maxAllowed = 630;
      slotDisplayRange = '05:00 ~ 10:00';
    } else if (targetSlot === '점심') {
      // 공식 11:00 ~ 13:30 (버퍼 10:30 ~ 14:00)
      minAllowed = 630;
      maxAllowed = 840;
      slotDisplayRange = '11:00 ~ 13:30';
    } else if (targetSlot === '저녁') {
      // 공식 17:00 ~ 22:00 (버퍼 16:30 ~ 22:30)
      minAllowed = 990;
      maxAllowed = 1350;
      slotDisplayRange = '17:00 ~ 22:00';
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

    // 검증 성공 (EXIF 인증 완료)
    return {
      hasExif: true,
      isValid: true,
      photoDate,
      photoTime,
    };
  } catch (error) {
    console.error('EXIF extraction error:', error);
    // 예외 발생 시 업로드를 부당하게 차단하지 않도록 허용
    return {
      hasExif: false,
      isValid: true,
    };
  }
}
