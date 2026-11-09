import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MealEntry } from '@/types/meal';
import { MEMBERS, LEGACY_MEMBERS, checkCanRegisterMeal, getKSTNow } from '@/constants/members';
import { getClientIp, maskIp, normalizeIp } from '@/lib/ip';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const slot = searchParams.get('slot');
    const member = searchParams.get('member');

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({
        success: true,
        meals: [],
        storageMode: 'client_local',
        message: 'MongoDB 연결 준비 중입니다. 클라이언트 로컬 저장소를 연동합니다.',
      });
    }

    const query: Record<string, any> = {};
    if (date) query.date = date;
    if (slot) query.slot = slot;
    if (member) query.member = member;

    const meals = await db
      .collection<MealEntry>('meals')
      .find(query)
      .sort({ date: -1, createdAt: 1 })
      .toArray();

    const rawIp = getClientIp(request);
    const clientIp = normalizeIp(rawIp) || '';

    const formattedMeals = meals.map((m: any) => ({
      ...m,
      id: m.id || m._id.toString(),
      _id: undefined,
      ip: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      viewedIps: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      likedIps: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      views: typeof m.views === 'number' ? m.views : 0,
      likes: typeof m.likes === 'number' ? Math.max(0, m.likes) : 0,
      hasLiked: Boolean(clientIp && Array.isArray(m.likedIps) && m.likedIps.includes(clientIp)),
      comments: Array.isArray(m.comments)
        ? m.comments
            .filter((c: any) => !c.isDeleted)
            .map((c: any) => {
              const isMember =
                MEMBERS.some((mem) => mem.name === c.author) ||
                LEGACY_MEMBERS.some((mem) => mem.name === c.author);
              return {
                id: c.id,
                author: c.author,
                content: c.content,
                createdAt: c.createdAt,
                maskedIp: isMember ? undefined : (maskIp(c.maskedIp || c.ip) || undefined),
              };
            })
        : [],
    }));

    return NextResponse.json(
      {
        success: true,
        meals: formattedMeals,
        storageMode: 'mongodb',
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Failed to fetch meals from DB:', error);
    return NextResponse.json(
      { success: false, message: '식사 데이터 조회 실패', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, time, slot, member, menuName, comment, imageUrl, exifTakenAt, adminId, adminPw } = body;

    const isAdmin =
      (adminId === ADMIN_ID && adminPw === ADMIN_PW) ||
      (request.headers.get('x-admin-id') === ADMIN_ID && request.headers.get('x-admin-pw') === ADMIN_PW);

    // 필수는 멤버 선택과 사진입니다. (활동 멤버만 신규 등록 가능, 실버 등 레거시 멤버 제외)
    if (!member || !MEMBERS.some((m) => m.name === member.trim())) {
      return NextResponse.json(
        { success: false, message: '유효한 활동 멤버를 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, message: '식사 사진을 업로드해주세요.' },
        { status: 400 }
      );
    }

    // 제목/메뉴 이름은 필수가 아니며, 미입력 시 '오늘의 식사'로 기본 적용
    const finalMenuName = (menuName && menuName.trim()) ? menuName.trim() : '오늘의 한 끼';
    const kstNow = getKSTNow();
    const mealId = body.id || `meal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const mealDate = date || kstNow.date;
    const targetSlot = slot || kstNow.activeSlot || '점심';

    // 한국 현재 시간(KST) 기준 지난 타임대 및 휴식 시간대(22:30~05:00) 등록 제한 검증 (관리자는 통과)
    if (!isAdmin) {
      const timeCheck = checkCanRegisterMeal(mealDate, targetSlot);
      if (!timeCheck.canRegister) {
        return NextResponse.json(
          { success: false, message: timeCheck.reason },
          { status: 400 }
        );
      }
    }

    // 카메라 원본 촬영 일시(EXIF) 및 타임대 일치 서버 레벨 이중 검증 (스크린샷 우회 차단)
    // 관리자(isAdmin)인 경우: 메타데이터 제한 우회 허용 (적정 시간대 외 사진, 카톡 사진, 스샷 사진 등록 허용)
    if (!isAdmin) {
      if (!exifTakenAt || typeof exifTakenAt !== 'string') {
        return NextResponse.json(
          { success: false, message: '카메라 원본 촬영 정보(EXIF)가 확인되지 않는 사진(스크린샷 등)은 등록할 수 없습니다.' },
          { status: 400 }
        );
      }

      const exifMatch = exifTakenAt.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
      if (!exifMatch) {
        return NextResponse.json(
          { success: false, message: '유효하지 않은 촬영 일시 형식입니다.' },
          { status: 400 }
        );
      }

      const [, photoDate, hoursStr, minsStr] = exifMatch;
      if (photoDate !== mealDate) {
        return NextResponse.json(
          { success: false, message: `해당 타임대에 촬영된 사진이 아닙니다 : ${exifTakenAt}` },
          { status: 400 }
        );
      }

      const totalMins = parseInt(hoursStr, 10) * 60 + parseInt(minsStr, 10);
      let minAllowed = 0;
      let maxAllowed = 0;
      if (targetSlot === '아침') {
        minAllowed = 270;
        maxAllowed = 630;
      } else if (targetSlot === '점심') {
        minAllowed = 630;
        maxAllowed = 840;
      } else if (targetSlot === '저녁') {
        minAllowed = 990;
        maxAllowed = 1350;
      }

      if (totalMins < minAllowed || totalMins > maxAllowed) {
        return NextResponse.json(
          { success: false, message: `해당 타임대에 촬영된 사진이 아닙니다 : ${exifTakenAt}` },
          { status: 400 }
        );
      }
    }

    // oci2 이미지 스토리지 연동 (/root/winner_aial/YYYY-MM-DD/)
    let finalImageUrl = imageUrl;
    if (imageUrl && imageUrl.startsWith('data:image/')) {
      try {
        const uploadResp = await fetch('https://oci2.silverruler.xyz/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: mealDate,
            mealId,
            imageBase64: imageUrl,
          }),
        });
        if (uploadResp.ok) {
          const uploadData = await uploadResp.json();
          if (uploadData.success && uploadData.url) {
            finalImageUrl = uploadData.url;
          }
        }
      } catch (uploadErr) {
        console.warn('Image upload to oci2 failed, falling back to original imageUrl:', uploadErr);
      }
    }

    // 클라이언트 IP 추출 (몽고디비 내부 기록용, UI 비공개)
    const clientIp = getClientIp(request);

    const newEntry: MealEntry = {
      id: mealId,
      date: mealDate,
      time: time || new Date().toTimeString().substring(0, 5),
      slot: slot || '점심',
      member: member.trim(),
      menuName: finalMenuName,
      comment: (comment || '').trim(),
      imageUrl: finalImageUrl,
      exifTakenAt: exifTakenAt || `${mealDate} ${time || kstNow.time}${isAdmin ? ' (관리자 예외 등록)' : ''}`,
      isWinner: false,
      views: 0,
      viewedIps: [],
      likes: 0,
      likedIps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ip: clientIp, // 몽고디비 원본 전체 IP 기록
    };

    const db = await getDatabase();
    if (db) {
      // 해당 날짜, 해당 타임대(slot)에 동일 멤버가 이미 등록했는지 중복 검사
      const existingEntry = await db.collection<MealEntry>('meals').findOne({
        date: date || new Date().toISOString().split('T')[0],
        slot: slot || '점심',
        member: member.trim(),
      });

      if (existingEntry) {
        return NextResponse.json(
          {
            success: false,
            message: `${member.trim()}님은 이미 이번 ${slot || '점심'}에 식사 사진을 등록하셨습니다. (타임대별 1인 1회만 등록 가능)`,
          },
          { status: 409 }
        );
      }

      await db.collection('meals').insertOne({
        ...newEntry,
        _id: newEntry.id as any,
      });

      // 클라이언트 응답 시에는 IP를 제거하여 브라우저에 노출되지 않도록 처리
      const responseMeal = {
        ...newEntry,
        ip: undefined,
        viewedIps: undefined,
        likedIps: undefined,
        hasLiked: false,
      };

      return NextResponse.json({
        success: true,
        meal: responseMeal,
        storageMode: 'mongodb',
      });
    }

    const responseMeal = {
      ...newEntry,
      ip: undefined,
      viewedIps: undefined,
      likedIps: undefined,
      hasLiked: false,
    };

    return NextResponse.json({
      success: true,
      meal: responseMeal,
      storageMode: 'client_local',
      notice: 'MongoDB 연결 대기 중: 브라우저 로컬 저장소에 저장되었습니다.',
    });
  } catch (error: any) {
    console.error('Failed to save meal entry:', error);
    return NextResponse.json(
      { success: false, message: '식사 일지 등록 실패', error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, menuName, comment, slot, member, adminId, adminPw } = body;

    if (adminId !== ADMIN_ID || adminPw !== ADMIN_PW) {
      return NextResponse.json(
        { success: false, message: '관리자 인증에 실패했습니다.' },
        { status: 401 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: '수정할 식사 일지 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const updateFields: Record<string, any> = { updatedAt: Date.now() };
    if (menuName !== undefined) updateFields.menuName = menuName.trim() || '오늘의 한 끼';
    if (comment !== undefined) updateFields.comment = comment.trim();
    if (slot !== undefined) updateFields.slot = slot;
    if (member !== undefined) updateFields.member = member.trim();

    const db = await getDatabase();
    if (db) {
      await db.collection('meals').updateOne(
        { $or: [{ id }, { _id: id as any }] },
        { $set: updateFields }
      );
    }

    return NextResponse.json({
      success: true,
      updatedId: id,
      updatedFields: updateFields,
    });
  } catch (error: any) {
    console.error('Failed to update meal:', error);
    return NextResponse.json(
      { success: false, message: '식사 일지 수정 실패', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const adminId = searchParams.get('adminId');
    const adminPw = searchParams.get('adminPw');

    if (adminId !== ADMIN_ID || adminPw !== ADMIN_PW) {
      return NextResponse.json(
        { success: false, message: '관리자 인증에 실패했습니다.' },
        { status: 401 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: '삭제할 식사 일지 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (db) {
      await db.collection('meals').deleteOne({
        $or: [{ id }, { _id: id as any }],
      });
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (error: any) {
    console.error('Failed to delete meal:', error);
    return NextResponse.json(
      { success: false, message: '삭제 실패', error: error.message },
      { status: 500 }
    );
  }
}
