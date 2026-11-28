import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDatabase } from '@/lib/mongodb';
import { MealEntry } from '@/types/meal';
import { MEMBERS, LEGACY_MEMBERS, checkCanRegisterMeal, getKSTNow } from '@/constants/members';
import { getClientIp, maskIp, normalizeIp } from '@/lib/ip';
import { grantGachaTickets } from '@/lib/gachaServer';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';
const DEVICE_COOKIE_NAME = 'aial_device_id';

interface RequestIdentity {
  rawIp: string;
  ipNorm: string;
  userAgent: string;
  uaPlatform?: string;
  uaMobile?: string;
  deviceId: string;
}

function extractRequestIdentity(request: NextRequest): RequestIdentity {
  const rawIp = getClientIp(request);
  const ipNorm = normalizeIp(rawIp) || '';
  const userAgent = (request.headers.get('user-agent') || '').trim();
  const uaPlatform =
    (request.headers.get('sec-ch-ua-platform') || '').replace(/"/g, '').trim() || undefined;
  const uaMobile = (request.headers.get('sec-ch-ua-mobile') || '').trim() || undefined;
  const deviceId = (request.cookies.get(DEVICE_COOKIE_NAME)?.value || '').trim();

  return { rawIp, ipNorm, userAgent, uaPlatform, uaMobile, deviceId };
}

/**
 * 현재 요청자가 해당 게시글의 작성자 본인인지 판별
 * 1) 신규 게시글(authorDeviceId 보유) & 요청에 기기 쿠키 존재: 쿠키 일치 여부로 판별 (모바일 IP 변경 대응 + 동일 Wi-Fi 타인 차단)
 * 2) 쿠키가 없는 경우(쿠키 삭제 등) 또는 구 게시글: IP 일치 + (UA가 기록돼 있으면 UA 일치)로 판별
 * 3) IP/기기 정보가 아예 없는 아주 오래된 게시글: 관리자만 가능
 */
function checkIsMealAuthor(meal: any, identity: RequestIdentity): boolean {
  if (!meal) return false;
  const mealDeviceId = typeof meal.authorDeviceId === 'string' ? meal.authorDeviceId.trim() : '';
  const mealIpNorm = normalizeIp(meal.ip);
  const mealUa = typeof meal.userAgent === 'string' ? meal.userAgent.trim() : '';

  if (mealDeviceId && identity.deviceId) {
    return mealDeviceId === identity.deviceId;
  }

  if (!mealIpNorm || !identity.ipNorm || mealIpNorm !== identity.ipNorm) {
    return false;
  }

  if (mealUa) {
    return Boolean(identity.userAgent && mealUa === identity.userAgent);
  }

  return true;
}

function attachDeviceCookie(response: NextResponse, request: NextRequest, deviceId: string) {
  const isHttps =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
  response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1년
  });
}

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

    const identity = extractRequestIdentity(request);
    const clientIp = identity.ipNorm;

    const formattedMeals = meals.map((m: any) => ({
      ...m,
      id: m.id || m._id.toString(),
      _id: undefined,
      ip: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      userAgent: undefined, // UI 노출 방지
      uaPlatform: undefined, // UI 노출 방지
      uaMobile: undefined, // UI 노출 방지
      authorDeviceId: undefined, // UI 노출 방지
      viewedIps: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      likedIps: undefined, // UI 노출 방지 (몽고디비 내부에만 기록)
      views: typeof m.views === 'number' ? m.views : 0,
      likes: typeof m.likes === 'number' ? Math.max(0, m.likes) : 0,
      hasLiked: Boolean(clientIp && Array.isArray(m.likedIps) && m.likedIps.includes(clientIp)),
      isMine: checkIsMealAuthor(m, identity),
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
    const { date, time, slot, member, menuName, comment, imageUrl, isNoPhoto, exifTakenAt, adminId, adminPw } = body;

    const isAdmin =
      (adminId === ADMIN_ID && adminPw === ADMIN_PW) ||
      (request.headers.get('x-admin-id') === ADMIN_ID && request.headers.get('x-admin-pw') === ADMIN_PW);

    // 활동 멤버만 신규 등록 가능 (실버 등 레거시 멤버 제외)
    if (!member || !MEMBERS.some((m) => m.name === member.trim())) {
      return NextResponse.json(
        { success: false, message: '유효한 활동 멤버를 선택해주세요.' },
        { status: 400 }
      );
    }

    const rawImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    const trimmedMenuName = typeof menuName === 'string' ? menuName.trim() : '';
    const noPhotoMode = Boolean(isNoPhoto || !rawImageUrl || rawImageUrl === '/mdm.jpg');

    // 사진 OR 제목(메뉴 이름) 둘 중 하나는 필수
    if (noPhotoMode && !trimmedMenuName) {
      return NextResponse.json(
        {
          success: false,
          message: '식사 사진을 업로드하거나, 사진 없이 등록할 경우 메뉴 이름(제목)을 입력해주세요.',
        },
        { status: 400 }
      );
    }

    // 사진이 있을 때는 제목이 필수가 아니며 미입력 시 '오늘의 한 끼'로 기본 적용
    const finalMenuName = trimmedMenuName || '오늘의 한 끼';
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

    // 카메라 원본 촬영 일시(EXIF) 및 타임대 일치 서버 레벨 이중 검증 (사진이 첨부된 일반 등록 시 적용)
    // 사내 MDM 등으로 사진 없이 글만 올리는 경우(noPhotoMode) 및 관리자(isAdmin)는 EXIF 검증 생략
    if (!isAdmin && !noPhotoMode) {
      if (!exifTakenAt || typeof exifTakenAt !== 'string') {
        return NextResponse.json(
          { success: false, message: '카메라 원본 촬영 정보(EXIF)가 확인되지 않는 사진(카톡 다운로드, 스크린샷 등)은 등록할 수 없습니다.' },
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

    // oci2 이미지 스토리지 연동 (/root/winner_aial/YYYY-MM-DD/) — 사진 미첨부(MDM) 시 /mdm.jpg 기본 적용
    let finalImageUrl = noPhotoMode ? '/mdm.jpg' : rawImageUrl;
    if (!noPhotoMode && rawImageUrl.startsWith('data:image/')) {
      try {
        const uploadResp = await fetch('https://oci2.silverruler.xyz/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: mealDate,
            mealId,
            imageBase64: rawImageUrl,
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

    // 클라이언트 IP, User-Agent 및 기기 식별 쿠키 추출 (몽고디비 내부 기록용, UI 비공개)
    const identity = extractRequestIdentity(request);
    const authorDeviceId = identity.deviceId || crypto.randomUUID();
    const shouldSetDeviceCookie = !identity.deviceId;

    const newEntry: MealEntry = {
      id: mealId,
      date: mealDate,
      time: time || new Date().toTimeString().substring(0, 5),
      slot: slot || '점심',
      member: member.trim(),
      menuName: finalMenuName,
      comment: (comment || '').trim(),
      imageUrl: finalImageUrl,
      isNoPhoto: noPhotoMode,
      exifTakenAt: noPhotoMode
        ? `${mealDate} ${time || kstNow.time} (사내 MDM · 사진 미첨부)`
        : exifTakenAt || `${mealDate} ${time || kstNow.time}${isAdmin ? ' (관리자 예외 등록)' : ''}`,
      isWinner: false,
      views: 0,
      viewedIps: [],
      likes: 0,
      likedIps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ip: identity.rawIp, // 몽고디비 원본 전체 IP 기록
      userAgent: identity.userAgent || undefined, // 몽고디비 원본 User-Agent 기록
      uaPlatform: identity.uaPlatform,
      uaMobile: identity.uaMobile,
      authorDeviceId, // 몽고디비 작성 기기 식별 ID (모바일 IP 변경 대응 + 동일 Wi-Fi 타인 차단)
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

      // 식사 등록 시 승패 무관하게 해당 멤버에게 UFO 뽑기권 5회 자동 적립
      // 단, 동일 날짜·타임·멤버로 삭제 후 재등록 시 중복 지급(악용) 원천 차단
      let gachaTicketGranted = false;
      let newTicketBalance: number | undefined = undefined;
      try {
        const grantKey = `${newEntry.date}_${newEntry.slot}_${newEntry.member}`;
        await db.collection('gacha_ticket_grants').insertOne({
          _id: grantKey as any,
          date: newEntry.date,
          slot: newEntry.slot,
          member: newEntry.member,
          amount: 5,
          mealId: newEntry.id,
          grantedAt: Date.now(),
        });
        newTicketBalance = await grantGachaTickets(db, newEntry.member, 5);
        gachaTicketGranted = true;
      } catch (ticketErr: any) {
        if (ticketErr?.code === 11000) {
          // 이미 해당 날짜·타임에 뽑기권이 지급된 이력이 있으므로 중복 지급 생략
          gachaTicketGranted = false;
        } else {
          console.warn('Failed to grant gacha ticket on meal insert:', ticketErr);
        }
      }

      // 클라이언트 응답 시에는 민감 기기/IP 정보를 제거하여 브라우저에 노출되지 않도록 처리
      const responseMeal = {
        ...newEntry,
        ip: undefined,
        userAgent: undefined,
        uaPlatform: undefined,
        uaMobile: undefined,
        authorDeviceId: undefined,
        viewedIps: undefined,
        likedIps: undefined,
        hasLiked: false,
        isMine: true,
      };

      const res = NextResponse.json({
        success: true,
        meal: responseMeal,
        gachaTicketGranted,
        gachaTicketBalance: newTicketBalance,
        storageMode: 'mongodb',
      });
      if (shouldSetDeviceCookie) {
        attachDeviceCookie(res, request, authorDeviceId);
      }
      return res;
    }

    const responseMeal = {
      ...newEntry,
      ip: undefined,
      userAgent: undefined,
      uaPlatform: undefined,
      uaMobile: undefined,
      authorDeviceId: undefined,
      viewedIps: undefined,
      likedIps: undefined,
      hasLiked: false,
      isMine: true,
    };

    const res = NextResponse.json({
      success: true,
      meal: responseMeal,
      storageMode: 'client_local',
      notice: 'MongoDB 연결 대기 중: 브라우저 로컬 저장소에 저장되었습니다.',
    });
    if (shouldSetDeviceCookie) {
      attachDeviceCookie(res, request, authorDeviceId);
    }
    return res;
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

    if (!id) {
      return NextResponse.json(
        { success: false, message: '수정할 식사 일지 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const reqAdminId = (adminId ?? request.headers.get('x-admin-id') ?? '').toString().trim();
    const reqAdminPw = (adminPw ?? request.headers.get('x-admin-pw') ?? '').toString().trim();
    const attemptedAdmin = Boolean(reqAdminId || reqAdminPw);
    const isAdmin = reqAdminId === ADMIN_ID && reqAdminPw === ADMIN_PW;
    const identity = extractRequestIdentity(request);

    const db = await getDatabase();
    let targetMeal: any = null;
    if (db) {
      targetMeal = await db.collection('meals').findOne({
        $or: [{ id }, { _id: id as any }],
      });

      if (!targetMeal) {
        return NextResponse.json(
          { success: false, message: '수정할 식사 게시글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (!isAdmin) {
        const isAuthor = checkIsMealAuthor(targetMeal, identity);
        if (!isAuthor) {
          if (attemptedAdmin) {
            return NextResponse.json(
              { success: false, message: '관리자 인증에 실패했습니다.' },
              { status: 401 }
            );
          }
          const hasAuthorTrack = Boolean(targetMeal.ip || targetMeal.authorDeviceId);
          return NextResponse.json(
            {
              success: false,
              requireAdmin: true,
              message: hasAuthorTrack
                ? '본인이 작성한 기기(IP/브라우저)에서만 수정할 수 있습니다.'
                : '작성 기기 기록 기능 적용 전에 등록된 게시글은 관리자만 수정할 수 있습니다.',
            },
            { status: 403 }
          );
        }
      }
    } else if (!isAdmin) {
      return NextResponse.json(
        { success: false, message: '관리자 인증에 실패했습니다.' },
        { status: 401 }
      );
    }

    const updateFields: Record<string, any> = { updatedAt: Date.now() };
    if (menuName !== undefined) {
      const trimmedMenu = String(menuName).trim();
      if (targetMeal?.isNoPhoto && !trimmedMenu) {
        return NextResponse.json(
          { success: false, message: '사진 없이 등록된 게시글은 메뉴 이름을 비워둘 수 없습니다.' },
          { status: 400 }
        );
      }
      updateFields.menuName = trimmedMenu || '오늘의 한 끼';
    }
    if (comment !== undefined) updateFields.comment = String(comment).trim();
    // 작성 멤버 및 타임대 변경은 관리자 권한에서만 허용
    if (isAdmin && slot !== undefined) updateFields.slot = slot;
    if (isAdmin && member !== undefined) updateFields.member = String(member).trim();

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
      editedBy: isAdmin ? 'admin' : 'author',
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
    const reqAdminId = (searchParams.get('adminId') || request.headers.get('x-admin-id') || '').trim();
    const reqAdminPw = (searchParams.get('adminPw') || request.headers.get('x-admin-pw') || '').trim();
    const attemptedAdmin = Boolean(reqAdminId || reqAdminPw);
    const isAdmin = reqAdminId === ADMIN_ID && reqAdminPw === ADMIN_PW;

    if (!id) {
      return NextResponse.json(
        { success: false, message: '삭제할 식사 일지 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const identity = extractRequestIdentity(request);
    const db = await getDatabase();
    if (db) {
      const targetMeal: any = await db.collection('meals').findOne({
        $or: [{ id }, { _id: id as any }],
      });

      if (!targetMeal) {
        return NextResponse.json(
          { success: false, message: '삭제할 식사 게시글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (!isAdmin) {
        const isAuthor = checkIsMealAuthor(targetMeal, identity);
        if (!isAuthor) {
          if (attemptedAdmin) {
            return NextResponse.json(
              { success: false, message: '관리자 인증에 실패했습니다.' },
              { status: 401 }
            );
          }
          const hasAuthorTrack = Boolean(targetMeal.ip || targetMeal.authorDeviceId);
          return NextResponse.json(
            {
              success: false,
              requireAdmin: true,
              message: hasAuthorTrack
                ? '본인이 작성한 기기(IP/브라우저)에서만 삭제할 수 있습니다.'
                : '작성 기기 기록 기능 적용 전에 등록된 게시글은 관리자만 삭제할 수 있습니다.',
            },
            { status: 403 }
          );
        }
      }

      // 원본 감사 로그 보관 (실제 meals 컬렉션에서 삭제해 동일 타임 재등록 가능하도록 유지)
      try {
        await db.collection('deleted_meals_log').insertOne({
          originalMeal: targetMeal,
          mealId: targetMeal.id || String(targetMeal._id),
          deletedAt: Date.now(),
          deletedBy: isAdmin ? 'admin' : 'author',
          deletedIp: identity.rawIp,
          deletedUserAgent: identity.userAgent || undefined,
          deletedDeviceId: identity.deviceId || undefined,
        });
      } catch (logErr) {
        console.warn('Failed to archive deleted meal log:', logErr);
      }

      await db.collection('meals').deleteOne({
        $or: [{ id }, { _id: id as any }],
      });

      // 이미 AI 심사가 완료된 타임대의 우승작(또는 평가작)이 삭제된 경우 남은 평가작 중 최고점으로 승자 재산정
      if (targetMeal.date && targetMeal.slot && (targetMeal.isWinner || typeof targetMeal.score === 'number')) {
        try {
          const remaining = await db
            .collection('meals')
            .find({ date: targetMeal.date, slot: targetMeal.slot })
            .toArray();
          const scored = remaining.filter((m: any) => typeof m.score === 'number');
          if (scored.length > 0) {
            const maxScore = Math.max(...scored.map((m: any) => Number(m.score)));
            const now = Date.now();
            for (const m of scored) {
              const nextWinner = Number(m.score) === maxScore;
              if (Boolean(m.isWinner) !== nextWinner) {
                await db.collection('meals').updateOne(
                  { _id: m._id },
                  { $set: { isWinner: nextWinner, updatedAt: now } }
                );
              }
            }
          }
        } catch (recalcErr) {
          console.warn('Failed to recalculate winners after meal delete:', recalcErr);
        }
      }
    } else if (!isAdmin) {
      return NextResponse.json(
        { success: false, message: '관리자 인증에 실패했습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
      deletedBy: isAdmin ? 'admin' : 'author',
    });
  } catch (error: any) {
    console.error('Failed to delete meal:', error);
    return NextResponse.json(
      { success: false, message: '삭제 실패', error: error.message },
      { status: 500 }
    );
  }
}
