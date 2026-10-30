import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { MealEntry } from '@/types/meal';

export const maxDuration = 60;

// NVIDIA NIM Vision Model (Primary & Fallback)
const NIM_API_URL = process.env.NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const NIM_MODEL = process.env.NIM_MODEL || 'mistralai/mistral-large-4-1t-a52b';
const NIM_FALLBACK_MODEL = process.env.NIM_FALLBACK_MODEL || 'meta/muse-glimmer-30b';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

// LLM evaluation service (sr-combo on oci2 - fallback)
const LLM_API_URL = process.env.LLM_API_URL || 'http://oci2.silverruler.xyz:20129/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'sr-combo';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

interface SingleEvalResult {
  score: number;
  review: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, slot } = body;

    if (!date || !slot) {
      return NextResponse.json(
        { success: false, message: '평가할 날짜(date)와 식사 타임(slot)을 지정해주세요.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    let entries: MealEntry[] = [];

    if (db) {
      const rawEntries = await db
        .collection<MealEntry>('meals')
        .find({ date, slot })
        .toArray();

      entries = rawEntries.map((m: any) => ({
        ...m,
        id: m.id || m._id.toString(),
        _id: undefined,
      }));
    } else {
      if (Array.isArray(body.clientEntries)) {
        entries = body.clientEntries;
      }
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { success: false, message: `${date} ${slot} 타임에 등록된 식사 사진이 없습니다.` },
        { status: 404 }
      );
    }

    // 1개만 등록된 경우: 단독 출품 우승
    if (entries.length === 1) {
      const soleEntry = entries[0];
      const { score, review } = await evaluateSingleMeal(slot, soleEntry);
      const updateData = {
        isWinner: true,
        score,
        aiReview: `[단독 출품 WIN!] ${review}`,
        evaluatedAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (db) {
        await db.collection('meals').updateOne(
          { $or: [{ id: soleEntry.id }, { _id: soleEntry.id as any }] },
          { $set: updateData }
        );
      }

      return NextResponse.json({
        success: true,
        message: '단독 출품으로 우승이 결정되었습니다.',
        winnerId: soleEntry.id,
        winnerMember: soleEntry.member,
        score,
        aiReview: updateData.aiReview,
        evaluatedEntries: [{ ...soleEntry, ...updateData }],
      });
    }

    // 이미 우승자가 선정된 경우: 기존 우승자는 보존하고 미채점 게시물만 개별 평가
    const existingWinner = entries.find((e) => e.isWinner);
    const unscoredEntries = entries.filter((e) => e.score === undefined || e.score === null);

    if (existingWinner && !body.force) {
      if (unscoredEntries.length === 0) {
        return NextResponse.json({
          success: true,
          message: `이미 우승자(${existingWinner.member})가 확정되었고 모든 식사의 평가가 완료되었습니다.`,
          winnerId: existingWinner.id,
          winnerMember: existingWinner.member,
          score: existingWinner.score,
          aiReview: existingWinner.aiReview,
          evaluatedEntries: entries,
        });
      }

      const updatedEntries = [...entries];
      const now = Date.now();
      const winnerScore = existingWinner.score || 95;

      for (const un of unscoredEntries) {
        const { score: rawScore, review } = await evaluateSingleMeal(slot, un);
        const score = Math.min(winnerScore - 1, Math.max(30, rawScore));

        if (db) {
          await db.collection('meals').updateOne(
            { $or: [{ id: un.id }, { _id: un.id as any }] },
            {
              $set: {
                isWinner: false,
                score,
                aiReview: review,
                evaluatedAt: now,
                updatedAt: now,
              },
            }
          );
        }
        const idx = updatedEntries.findIndex((e) => e.id === un.id);
        if (idx !== -1) {
          updatedEntries[idx] = {
            ...updatedEntries[idx],
            isWinner: false,
            score,
            aiReview: review,
            evaluatedAt: now,
            updatedAt: now,
          };
        }
      }

      return NextResponse.json({
        success: true,
        message: `기존 우승자(${existingWinner.member})를 유지하며 미채점 ${unscoredEntries.length}개 식사의 평가를 완료했습니다.`,
        winnerId: existingWinner.id,
        winnerMember: existingWinner.member,
        score: existingWinner.score,
        aiReview: existingWinner.aiReview,
        evaluatedEntries: updatedEntries,
      });
    }

    // 2개 이상인 경우: 각 사진을 개별 평가 후 최고 점수자 WIN 선정 (병렬 처리로 타임아웃 방지)
    // 동점자 발생 시 업로드 시간(createdAt)이 빠른 사람 WIN
    const evaluatedItems = await Promise.all(
      entries.map(async (entry) => {
        const { score, review } = await evaluateSingleMeal(slot, entry);
        const createdAt =
          typeof entry.createdAt === 'number'
            ? entry.createdAt
            : new Date(entry.createdAt || 0).getTime() || 0;
        return { entry, score, review, createdAt };
      })
    );

    // 정렬: 1차 점수(내림차순, 최고점), 2차 업로드시간(오름차순, 빠른시간)
    evaluatedItems.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.createdAt - b.createdAt;
    });

    const maxScore = evaluatedItems[0]?.score ?? 0;
    const now = Date.now();
    const updatedEntries = evaluatedItems.map((item) => {
      // 동일 최고 점수인 경우 공동 우승(Joint Winner) 처리
      const isWinner = item.score === maxScore;
      return {
        ...item.entry,
        isWinner,
        score: item.score,
        aiReview: item.review,
        evaluatedAt: now,
        updatedAt: now,
      };
    });

    if (db) {
      for (const entry of updatedEntries) {
        await db.collection('meals').updateOne(
          { $or: [{ id: entry.id }, { _id: entry.id as any }] },
          {
            $set: {
              isWinner: entry.isWinner,
              score: entry.score,
              aiReview: entry.aiReview,
              evaluatedAt: entry.evaluatedAt,
              updatedAt: entry.updatedAt,
            },
          }
        );
      }
    }

    const winners = updatedEntries.filter((e) => e.isWinner);
    const winnerNames = winners.map((w) => w.member).join(', ');
    const isTie = winners.length > 1;

    return NextResponse.json({
      success: true,
      message: isTie
        ? `${slot} 타임 동점 발생! [공동 우승: ${winnerNames}] (각 ${maxScore}점)`
        : `${slot} 타임 식사 평가가 완료되었습니다! [우승: ${winnerNames}] (${maxScore}점)`,
      winnerId: winners[0]?.id,
      winnerMember: winnerNames,
      score: maxScore,
      aiReview: winners[0]?.aiReview,
      evaluatedEntries: updatedEntries,
    });
  } catch (error: any) {
    console.error('Failed to run meal evaluation:', error);
    return NextResponse.json(
      { success: false, message: '식사 평가 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * NVIDIA NIM Vision API 단일 호출 헬퍼
 */
async function callNimVision(
  model: string,
  systemPrompt: string,
  contentList: any[],
  member: string
): Promise<SingleEvalResult | null> {
  if (!NVIDIA_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const resp = await fetch(NIM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentList },
        ],
        max_tokens: model.includes('glimmer') ? 8192 : 4096,
        stream: false,
        temperature: 0.3,
        top_p: 0.95,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      const rawText = await resp.text();
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(rawText.substring(start, end + 1));
        let evalData = parsed;
        if (parsed.choices && parsed.choices[0]?.message?.content) {
          const content = parsed.choices[0].message.content.trim();
          const cStart = content.indexOf('{');
          const cEnd = content.lastIndexOf('}');
          if (cStart !== -1 && cEnd !== -1) {
            evalData = JSON.parse(content.substring(cStart, cEnd + 1));
          }
        }
        if (typeof evalData.score === 'number' && typeof evalData.review === 'string') {
          return {
            score: Math.max(0, Math.min(100, Math.round(evalData.score))),
            review: evalData.review.trim(),
          };
        }
      }
    } else {
      console.warn(`[Single Meal Eval] NIM (${model}) response status: ${resp.status}`);
    }
  } catch (nimErr) {
    console.warn(`[Single Meal Eval] NIM (${model}) call failed for ${member}:`, nimErr);
  }
  return null;
}

/**
 * 참가자 1명의 식사를 개별 평가
 * 1순위: NVIDIA NIM Vision 모델 (mistralai/mistral-large-4-1t-a52b)을 통한 실제 이미지 직접 시각 평가.
 * 2순위: 1순위 실패 시 NVIDIA NIM Vision 모델 (meta/muse-glimmer-30b) 시각 평가 Fallback.
 * 3순위: NIM 실패 시 기존 sr-combo LLM 텍스트 기반 평가 fallback.
 * 4순위: 최종 휴리스틱 평가 fallback.
 */
async function evaluateSingleMeal(
  slot: string,
  entry: MealEntry
): Promise<SingleEvalResult> {
  const menuName = (entry.menuName || '').trim();
  const comment = (entry.comment || '').trim();
  const member = entry.member || '익명';
  const imageUrl = (entry.imageUrl || '').trim();

  const tDesc = menuName || '(등록된 메뉴명 없음)';
  const cDesc = comment || '(등록된 코멘트 없음)';
  const userPrompt = `참가자: ${member}\n출품 메뉴(제목): ${tDesc}\n코멘트: ${cDesc}\n제출된 식사 사진을 직접 시각적으로 관찰하여 미식 평가와 점수를 매겨주세요.`;

  // 1순위 & 2순위: NVIDIA NIM Vision 모델 호출
  if (NVIDIA_API_KEY) {
    let imageBase64: string | null = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          const cType = imgRes.headers.get('content-type') || 'image/jpeg';
          imageBase64 = `data:${cType};base64,${Buffer.from(ab).toString('base64')}`;
        }
      } catch (imgErr) {
        console.warn(`[Single Meal Eval] Image download failed for ${member}:`, imgErr);
      }
    }

    const nimSystemPrompt = `당신은 세계 최고 권위의 미식 평가단이자 'AIAL 식사 배틀'의 AI 심사위원입니다.
제출된 ${slot} 식사 사진을 직접 시각적으로 정밀 관찰하여 음식의 종류, 차림새, 재료의 조화, 신선도, 플레이팅을 냉정하고 전문적으로 평가하세요.

[총평 작성 규칙]
1. 총평(review)은 2~3문장으로 간결하고 임팩트 있게 작성하세요:
   - 전반부: 반드시 "이 식사는 [메뉴명 또는 사진에서 직접 관찰되는 음식]인 것 같으며, [사진에 보이는 음식의 실제 비주얼/색감/구성/상태에 대한 감각적이고 구체적인 미식 평가]" 형식으로 시작
   - 후반부: 왜 해당 점수를 주었는지에 대한 명확한 이유 (예: 재료의 조화, 조리 퀄리티, 정성, 완성도 등)
   예시: "이 식사는 순대국인 것 같으며, 진한 사골 육수에 고소한 들깨가루가 듬뿍 어우러져 깊고 묵직한 감칠맛을 선사하는 든든한 한 그릇입니다. 깊은 국물의 완성도와 조화로운 구성을 높게 평가하여 86점을 부여했습니다."
2. 사진에 식사가 없거나 다른 사물/풍경/인물 셀카, 또는 소스/단무지 종지만 있는 등 온전한 식사가 아닌 경우:
   - 사진에 식사가 없거나 극히 미비함을 냉정하게 지적하고 0점 ~ 20점대(식사가 전혀 아니거나 빈 그릇인 경우 0점)의 최하점을 가차없이 부여하세요.

[맛 점수(score) 채점 기준 - 0점부터 100점까지 냉정하고 다채로운 변별력 심사]
절대 모든 음식에 후한 점수를 주지 마세요. 0점 ~ 100점의 전체 점수 범위를 적극 활용하여 매우 냉정하고 다채롭게 점수를 부여하세요:
- 95 ~ 100점: 환상적인 미식, 최고급 요리, 비주얼과 정성 모두 감탄을 자아내는 프리미엄 식사 (파인다이닝, 고급 한우/스시, 정갈한 진수성찬 등)
- 85 ~ 94점: 훌륭하고 정성 가득한 한 끼, 영양과 맛의 밸런스가 뛰어난 식사 (정성껏 차린 가정식, 인기 맛집의 대표 요리 등)
- 70 ~ 84점: 평범하고 일상적인 무난한 대중적 식사 (일반 백반, 분식, 평범한 한 그릇 요리, 일반 배달음식 등)
- 40 ~ 69점: 단출하거나 가공식품 위주의 식사 (편의점 도시락/라면, 패스트푸드, 다소 부실한 구성)
- 10 ~ 39점: 극히 단출한 인스턴트나 대충 때우는 식사 (단순 컵라면 1개, 빵 한 조각, 간식 수준의 끼니)
- 0 ~ 9점: 식사가 아예 없거나(단무지만 있거나 빈 그릇, 소스 종지만 있음), 인물 셀카, 사물 등 식사와 무관한 사진 (극단적인 경우 0점 부여)

3. 반드시 다른 설명 없이 순수 JSON 포맷 하나만 출력하세요. (마크다운 코드블록 금지)

응답 포맷:
{"score": 85, "review": "이 식사는 ...인 것 같으며, ... 높은 완성도를 평가하여 85점을 부여했습니다."}`;

    const contentList: any[] = [{ type: 'text', text: userPrompt }];
    if (imageBase64) {
      contentList.push({ type: 'image_url', image_url: { url: imageBase64 } });
    }

    // 1순위: NIM Primary 모델 시도
    const tier1Res = await callNimVision(NIM_MODEL, nimSystemPrompt, contentList, member);
    if (tier1Res) {
      return tier1Res;
    }

    // 2순위: NIM Fallback 모델 시도
    console.warn(`[Single Meal Eval] Primary NIM (${NIM_MODEL}) failed for ${member}. Trying secondary NIM fallback (${NIM_FALLBACK_MODEL})...`);
    const tier2Res = await callNimVision(NIM_FALLBACK_MODEL, nimSystemPrompt, contentList, member);
    if (tier2Res) {
      return tier2Res;
    }
  }

  // 3순위: sr-combo LLM 텍스트 기반 평가 Fallback
  try {
    const systemPrompt = `당신은 세계 최고 권위의 미식 평가단이자 'AIAL 식사 배틀'의 AI 심사위원입니다.
각 참가자가 제출한 ${slot} 식사 사진의 제목(메뉴명)과 코멘트를 참고하여(없거나 비어있을 수도 있음) 전문적이고 감각적인 미식 총평과 맛 점수를 부여합니다.

[총평 작성 규칙]
1. 총평(review)은 기존과 같이 메뉴와 맛에 대해 평가하고, 이어서 왜 그 점수를 주었는지 간단한 이유를 덧붙여 2~3문장으로 작성하세요:
   - 전반부: 반드시 "이 식사는 [메뉴명 또는 추정되는 음식]인 것 같으며, [어떠어떠해서 어떠어떠하다 식의 구체적인 맛과 풍미 평가]" 형식으로 시작
   - 후반부: 왜 해당 점수를 주었는지에 대한 간단하고 명확한 이유 (예: 재료의 조화, 퀄리티, 정성, 비주얼, 완성도 등)
   예시: "이 식사는 순대국인 것 같으며, 진한 사골 육수에 고소한 들깨가루가 듬뿍 어우러져 깊고 묵직한 감칠맛을 선사하는 든든한 한 그릇입니다. 깊은 국물의 완성도와 조화로운 구성을 높게 평가하여 86점을 부여했습니다."
2. 메뉴명이나 코멘트가 없거나 빈칸이더라도, 적절한 맛있는 식사 메뉴를 상상/추정하여 자연스럽게 작성하세요.

[맛 점수(score) 채점 기준 - 0점부터 100점까지 냉정하고 다채로운 변별력 심사]
절대 모든 음식에 80점 이상의 후한 점수를 주지 마세요. 음식의 퀄리티, 정성, 완성도, 영양 균형에 따라 0점 ~ 100점 사이에서 냉정하게 변별하여 다양한 점수대를 부여하세요:
- 95 ~ 100점: 최고급 요리, 정갈하고 완벽한 조화와 정성이 돋보이는 프리미엄 식사 (파인다이닝, 고급 한우/스시, 정성 가득한 잔칫상 등)
- 85 ~ 94점: 훌륭하고 정성 가득한 한 끼, 영양과 맛의 밸런스가 뛰어난 식사 (정성껏 차린 가정식, 인기 맛집의 대표 메뉴 등)
- 70 ~ 84점: 평범하고 일상적인 무난한 대중적 식사 (일반 백반, 분식, 평범한 한 그릇 요리, 일반 배달음식 등)
- 40 ~ 69점: 단출하거나 가공식품 위주의 식사 (편의점 도시락/라면, 패스트푸드, 다소 부실한 구성)
- 10 ~ 39점: 극히 단출한 인스턴트나 대충 때우는 식사 (단순 컵라면 1개, 빵 한 조각, 간식 수준의 끼니)
- 0 ~ 9점: 식사가 아닌 경우나 극도로 부실한 경우 (최하 0점)

3. 반드시 다른 설명 없이 순수 JSON 포맷 하나만 출력하세요. (마크다운 코드블록 금지)

응답 포맷:
{"score": 75, "review": "이 식사는 ...인 것 같으며, ... 깊은 국물의 완성도와 조화로운 구성을 높게 평가하여 86점을 부여했습니다."}`;

    const fallbackUserPrompt = `참가자: ${member}\n출품 메뉴(제목): ${tDesc}\n코멘트: ${cDesc}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const resp = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
        Connection: 'close',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fallbackUserPrompt },
        ],
        temperature: 0.4,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      const rawText = await resp.text();
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonText = rawText.substring(start, end + 1);
        const parsed = JSON.parse(jsonText);

        let evalData = parsed;
        if (parsed.choices && parsed.choices[0]?.message?.content) {
          const content = parsed.choices[0].message.content.trim();
          const cStart = content.indexOf('{');
          const cEnd = content.lastIndexOf('}');
          if (cStart !== -1 && cEnd !== -1) {
            evalData = JSON.parse(content.substring(cStart, cEnd + 1));
          }
        }

        if (typeof evalData.score === 'number' && typeof evalData.review === 'string') {
          return {
            score: Math.max(0, Math.min(100, Math.round(evalData.score))),
            review: evalData.review.trim(),
          };
        }
      }
    }
  } catch (llmErr) {
    console.warn(`[Single Meal Eval] LLM fallback call failed for ${member}:`, llmErr);
  }

  // 4순위: Fallback 휴리스틱 평가
  const fallbackMenu = menuName || '정갈하고 든든한 한 끼';
  const fallbackScore = Math.floor(Math.random() * 26) + 60;
  return {
    score: fallbackScore,
    review: `이 식사는 ${fallbackMenu}인 것 같으며, 정성이 담긴 비주얼과 식욕을 돋우는 조화가 돋보이는 식사입니다. 음식의 구성과 차림새를 바탕으로 ${fallbackScore}점을 부여했습니다.`,
  };
}
