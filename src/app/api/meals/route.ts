import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MealEntry } from '@/types/meal';
import { checkCanRegisterMeal, getKSTNow } from '@/constants/members';

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

    const formattedMeals = meals.map((m: any) => ({
      ...m,
      id: m.id || m._id.toString(),
      _id: undefined,
    }));

    return NextResponse.json(
      {
        success: true,
        meals: formattedMeals,
        storageMode: 'mongodb',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=15',
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
    const { date, time, slot, member, menuName, comment, imageUrl } = body;

    // 필수는 멤버 선택과 사진입니다.
    if (!member) {
      return NextResponse.json(
        { success: false, message: '멤버(올리는 사람)를 선택해주세요.' },
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

    // 한국 현재 시간(KST) 기준 지난 타임대 및 휴식 시간대(22:30~05:00) 등록 제한 검증
    const timeCheck = checkCanRegisterMeal(mealDate, targetSlot);
    if (!timeCheck.canRegister) {
      return NextResponse.json(
        { success: false, message: timeCheck.reason },
        { status: 400 }
      );
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

    const newEntry: MealEntry = {
      id: mealId,
      date: mealDate,
      time: time || new Date().toTimeString().substring(0, 5),
      slot: slot || '점심',
      member: member.trim(),
      menuName: finalMenuName,
      comment: (comment || '').trim(),
      imageUrl: finalImageUrl,
      isWinner: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

      return NextResponse.json({
        success: true,
        meal: newEntry,
        storageMode: 'mongodb',
      });
    }

    return NextResponse.json({
      success: true,
      meal: newEntry,
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
