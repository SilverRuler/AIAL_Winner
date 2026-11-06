import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { REWARD_QUIZ_POOL, QuizQuestion } from '@/constants/quizzes';

const ADMIN_ID = process.env.ADMIN_ID || 'aaa';
const ADMIN_PW = process.env.ADMIN_PW || 'bbb';

function verifyAdmin(request: NextRequest, body?: any): boolean {
  const reqAdminId = request.headers.get('x-admin-id') || body?.adminId;
  const reqAdminPw = request.headers.get('x-admin-pw') || body?.adminPw;
  return reqAdminId === ADMIN_ID && reqAdminPw === ADMIN_PW;
}

/**
 * GET /api/quizzes
 * 전체 퀴즈 목록 조회 (DB에 데이터가 없으면 REWARD_QUIZ_POOL 6문제 기본 시딩)
 */
export async function GET() {
  try {
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json({ success: true, quizzes: REWARD_QUIZ_POOL });
    }

    const collection = db.collection('quizzes');
    const count = await collection.countDocuments();

    // 최초 실행 시 기본 문제 6개 시딩
    if (count === 0) {
      const seedData = REWARD_QUIZ_POOL.map((q, idx) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        showGuideImage: true,
        placeholder: q.placeholder || '정답 입력',
        answer: q.answer || (q.id === 'upbit_sol_min' ? '0.01' : ''),
        options: q.options || [],
        correctOption: q.correctOption,
        isCustom: false,
        createdAt: Date.now() - (REWARD_QUIZ_POOL.length - idx) * 1000,
      }));
      await collection.insertMany(seedData as any);
    }

    const rawQuizzes = await collection.find({}).sort({ createdAt: 1 }).toArray();
    const quizzes: QuizQuestion[] = rawQuizzes.map((doc: any) => ({
      id: doc.id || doc._id.toString(),
      question: doc.question,
      type: doc.type,
      showGuideImage: doc.showGuideImage ?? true,
      placeholder: doc.placeholder,
      answer: doc.answer,
      options: doc.options,
      correctOption: doc.correctOption,
      isCustom: doc.isCustom ?? false,
      createdAt: doc.createdAt,
    }));

    return NextResponse.json({ success: true, quizzes });
  } catch (error: any) {
    console.error('Failed to get quizzes:', error);
    return NextResponse.json(
      { success: false, message: '퀴즈 목록 조회 실패', quizzes: REWARD_QUIZ_POOL },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quizzes
 * 관리자 전용 신규 퀴즈 등록 (객관식 4지선다 or 주관식)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!verifyAdmin(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { question, type, answer, placeholder, options, correctOption, showGuideImage = true } = body;

    const trimmedQ = (question || '').trim();
    if (!trimmedQ) {
      return NextResponse.json(
        { success: false, message: '문제를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (type !== 'subjective' && type !== 'objective') {
      return NextResponse.json(
        { success: false, message: '문제 유형(객관식/주관식)을 올바르게 선택해주세요.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const newQuiz: QuizQuestion = {
      id: `quiz_${now}_${Math.random().toString(36).substring(2, 7)}`,
      question: trimmedQ,
      type,
      showGuideImage: showGuideImage !== false,
      isCustom: true,
      createdAt: now,
    };

    if (type === 'subjective') {
      const trimmedAns = (answer || '').trim();
      if (!trimmedAns) {
        return NextResponse.json(
          { success: false, message: '주관식 정답(A. 답)을 입력해주세요.' },
          { status: 400 }
        );
      }
      newQuiz.answer = trimmedAns;
      newQuiz.placeholder = (placeholder || '정답 입력').trim();
    } else {
      // 객관식 2~4지선다 검증
      if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
        return NextResponse.json(
          { success: false, message: '객관식은 최소 2개에서 최대 4개의 보기를 입력해야 합니다.' },
          { status: 400 }
        );
      }

      for (let i = 0; i < options.length; i++) {
        if (!options[i] || !options[i].text || !options[i].text.trim()) {
          return NextResponse.json(
            { success: false, message: `보기 ${i + 1}번 내용을 입력해주세요.` },
            { status: 400 }
          );
        }
      }

      const parsedCorrect = Number(correctOption);
      if (!parsedCorrect || parsedCorrect < 1 || parsedCorrect > options.length) {
        return NextResponse.json(
          { success: false, message: `1번부터 ${options.length}번 보기 중 하나를 정답으로 체크해주세요.` },
          { status: 400 }
        );
      }

      newQuiz.options = options.map((opt: any, idx: number) => ({
        no: idx + 1,
        text: opt.text.trim(),
      }));
      newQuiz.correctOption = parsedCorrect;
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    await db.collection('quizzes').insertOne(newQuiz as any);

    return NextResponse.json({
      success: true,
      message: '신규 퀴즈가 성공적으로 등록되었습니다.',
      quiz: newQuiz,
    });
  } catch (error: any) {
    console.error('Failed to create quiz:', error);
    return NextResponse.json(
      { success: false, message: '퀴즈 등록 중 오류 발생', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/quizzes
 * 관리자 전용 퀴즈 수정
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!verifyAdmin(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { id, question, type, answer, placeholder, options, correctOption } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: '수정할 퀴즈 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const trimmedQ = (question || '').trim();
    if (!trimmedQ) {
      return NextResponse.json(
        { success: false, message: '문제를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (type !== 'subjective' && type !== 'objective') {
      return NextResponse.json(
        { success: false, message: '문제 유형을 올바르게 선택해주세요.' },
        { status: 400 }
      );
    }

    const updateFields: Record<string, any> = {
      question: trimmedQ,
      type,
      updatedAt: Date.now(),
    };

    if (type === 'subjective') {
      const trimmedAns = (answer || '').trim();
      if (!trimmedAns) {
        return NextResponse.json(
          { success: false, message: '주관식 정답(A. 답)을 입력해주세요.' },
          { status: 400 }
        );
      }
      updateFields.answer = trimmedAns;
      updateFields.placeholder = (placeholder || '정답 입력').trim();
      updateFields.options = [];
      updateFields.correctOption = undefined;
    } else {
      if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
        return NextResponse.json(
          { success: false, message: '객관식은 최소 2개에서 최대 4개의 보기를 입력해야 합니다.' },
          { status: 400 }
        );
      }

      for (let i = 0; i < options.length; i++) {
        if (!options[i] || !options[i].text || !options[i].text.trim()) {
          return NextResponse.json(
            { success: false, message: `보기 ${i + 1}번 내용을 입력해주세요.` },
            { status: 400 }
          );
        }
      }

      const parsedCorrect = Number(correctOption);
      if (!parsedCorrect || parsedCorrect < 1 || parsedCorrect > options.length) {
        return NextResponse.json(
          { success: false, message: `1번부터 ${options.length}번 보기 중 하나를 정답으로 체크해주세요.` },
          { status: 400 }
        );
      }

      updateFields.options = options.map((opt: any, idx: number) => ({
        no: idx + 1,
        text: opt.text.trim(),
      }));
      updateFields.correctOption = parsedCorrect;
      updateFields.answer = undefined;
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const result = await db.collection('quizzes').updateOne(
      { $or: [{ id }, { _id: id as any }] },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: '수정할 퀴즈를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '퀴즈가 성공적으로 수정되었습니다.',
    });
  } catch (error: any) {
    console.error('Failed to update quiz:', error);
    return NextResponse.json(
      { success: false, message: '퀴즈 수정 중 오류 발생', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quizzes
 * 관리자 전용 퀴즈 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let quizId = searchParams.get('id');

    let body: any = null;
    try {
      body = await request.json();
      if (!quizId && body?.id) {
        quizId = body.id;
      }
    } catch (e) {}

    if (!verifyAdmin(request, body)) {
      return NextResponse.json(
        { success: false, message: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    if (!quizId) {
      return NextResponse.json(
        { success: false, message: '삭제할 퀴즈 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, message: '데이터베이스 연결 실패' },
        { status: 500 }
      );
    }

    const result = await db.collection('quizzes').deleteOne({
      $or: [{ id: quizId }, { _id: quizId as any }],
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: '삭제할 퀴즈를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '퀴즈가 성공적으로 삭제되었습니다.',
    });
  } catch (error: any) {
    console.error('Failed to delete quiz:', error);
    return NextResponse.json(
      { success: false, message: '퀴즈 삭제 중 오류 발생', error: error.message },
      { status: 500 }
    );
  }
}
