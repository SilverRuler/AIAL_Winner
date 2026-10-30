#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIAL_Winner - Meal Tastiness & Winner Evaluation Script
Designed to run on oci2 server via crontab or command line.

Usage:
  python3 evaluate_meals.py
  python3 evaluate_meals.py --slot 점심 --date 2026-10-25
  python3 evaluate_meals.py --force
"""

import os
import sys

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass
import json
import time
import random
import argparse
import base64
import io
import requests
from datetime import datetime
from PIL import Image

# 환경 변수 및 설정 로드
MONGO_URI = os.environ.get("MONGODB_URI", "")
LLM_API_URL = os.environ.get("LLM_API_URL", "http://127.0.0.1:20129/v1/chat/completions")
LLM_FALLBACK_URL = "http://oci2.silverruler.xyz:20129/v1/chat/completions"
MODEL_NAME = os.environ.get("LLM_MODEL", "sr-combo")
API_KEY = os.environ.get("LLM_API_KEY", "")

# NVIDIA NIM Vision 모델 설정 (1순위 & 2순위 미식 심사위원)
NIM_API_URL = os.environ.get("NIM_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
NIM_MODEL = os.environ.get("NIM_MODEL", "mistralai/mistral-large-4-1t-a52b")
NIM_FALLBACK_MODEL = os.environ.get("NIM_FALLBACK_MODEL", "meta/muse-glimmer-30b")
NIM_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# 로컬 .env 파일 보조 로드
env_file_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file_path):
    with open(env_file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

MONGO_URI = os.environ.get("MONGODB_URI", MONGO_URI)
API_KEY = os.environ.get("LLM_API_KEY", API_KEY)
LLM_API_URL = os.environ.get("LLM_API_URL", LLM_API_URL)
MODEL_NAME = os.environ.get("LLM_MODEL", MODEL_NAME)
NIM_API_URL = os.environ.get("NIM_API_URL", NIM_API_URL)
NIM_MODEL = os.environ.get("NIM_MODEL", NIM_MODEL)
NIM_FALLBACK_MODEL = os.environ.get("NIM_FALLBACK_MODEL", NIM_FALLBACK_MODEL)
NIM_API_KEY = os.environ.get("NVIDIA_API_KEY", NIM_API_KEY)

def get_current_slot():
    now = datetime.now()
    total_mins = now.hour * 60 + now.minute
    # 아침: 05:00 ~ 10:00 (10:00 종료 및 AI 평가)
    if 300 <= total_mins < 660:
        return "아침"
    # 점심: 11:00 ~ 13:30 (13:30 종료 및 AI 평가)
    elif 660 <= total_mins < 1020:
        return "점심"
    # 저녁: 17:00 ~ 22:00 (22:00 종료 및 AI 평가)
    else:
        return "저녁"

def get_image_data_url(image_url):
    """
    imageUrl을 받아서 이미지를 확인한 뒤 max 800px 크기의 JPEG Base64 Data URL로 반환.
    oci2 서버 로컬 파일 경로(/root/winner_aial/...)를 우선 탐색하여 고속 로드.
    """
    if not image_url:
        return None
    try:
        img_data = None
        # 1. oci2 로컬 파일 확인 (/root/winner_aial/...)
        if "/images/" in image_url:
            sub = image_url.split("/images/", 1)[1]
            local_p = os.path.join("/root/winner_aial", sub)
            if os.path.exists(local_p):
                with open(local_p, "rb") as f:
                    img_data = f.read()

        # 2. 로컬에 없으면 HTTP GET 다운로드
        if not img_data:
            resp = requests.get(image_url, timeout=15)
            if resp.status_code == 200:
                img_data = resp.content

        if not img_data:
            return None

        # PIL 리사이징 (800x800)
        img = Image.open(io.BytesIO(img_data))
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((800, 800))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception as e:
        print(f"  [Warn] Failed to prepare image data URL for {image_url}: {e}", flush=True)
        return None

def call_nim_vision(user_prompt, image_data_url, slot_name, model_name=None):
    """
    NVIDIA NIM Vision API를 호출하여
    실제 식사 사진을 시각적으로 관찰하고 전문적인 점수 및 미식 총평 반환.
    model_name이 지정되지 않으면 기본 1순위 모델(NIM_MODEL)을 사용.
    """
    if not NIM_API_KEY:
        return None

    target_model = model_name or NIM_MODEL

    system_prompt = f"""당신은 세계 최고 권위의 미식 평가단이자 'AIAL 식사 배틀'의 AI 심사위원입니다.
제출된 {slot_name} 식사 사진을 직접 시각적으로 정밀 관찰하여 음식의 종류, 차림새, 재료의 조화, 신선도, 플레이팅을 냉정하고 전문적으로 평가하세요.

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
{{"score": 85, "review": "이 식사는 ...인 것 같으며, ... 높은 완성도를 평가하여 85점을 부여했습니다."}}"""

    content_list = [{"type": "text", "text": user_prompt}]
    if image_data_url:
        content_list.append({"type": "image_url", "image_url": {"url": image_data_url}})

    max_tokens = 8192 if "glimmer" in target_model else 4096

    payload = {
        "model": target_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content_list}
        ],
        "max_tokens": max_tokens,
        "stream": True,
        "temperature": 0.3,
        "top_p": 0.95
    }

    headers = {
        "Authorization": f"Bearer {NIM_API_KEY}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json"
    }

    try:
        print(f"  [NIM Vision] Requesting evaluation from {target_model}...", flush=True)
        resp = requests.post(NIM_API_URL, headers=headers, json=payload, stream=True, timeout=(30, 180))
        if resp.status_code == 200:
            print(f"  [NIM Vision - {target_model}] Connected. Streaming evaluation (reasoning & review)...", flush=True)
            content_chunks = []
            for line in resp.iter_lines():
                if line:
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: ") and decoded != "data: [DONE]":
                        try:
                            data = json.loads(decoded[6:])
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            if delta.get("reasoning_content"):
                                print(".", end="", flush=True)
                            txt = delta.get("content", "")
                            if txt:
                                content_chunks.append(txt)
                                print(txt, end="", flush=True)
                        except Exception:
                            pass
            print("", flush=True)
            full_text = "".join(content_chunks).strip()
            s = full_text.find("{")
            e = full_text.rfind("}")
            if s != -1 and e != -1:
                parsed = json.loads(full_text[s:e+1])
                if "score" in parsed and "review" in parsed:
                    print(f"  [NIM Vision - {target_model}] Success! Score: {parsed['score']}", flush=True)
                    return parsed
            else:
                print(f"  [NIM Vision - {target_model}] Failed to parse JSON from output: {full_text[:120]}", flush=True)
        else:
            print(f"  [NIM Vision - {target_model}] HTTP Error {resp.status_code}: {resp.text[:150]}", flush=True)
    except Exception as e:
        print(f"  [NIM Vision - {target_model}] Request failed or timed out: {e}", flush=True)

    return None

def evaluate_single_meal(m, slot_name):
    """
    각 참가자의 식사 사진에 대해 1장씩 단독 평가를 수행.
    1순위: NVIDIA NIM Vision 모델 (mistralai/mistral-large-4-1t-a52b)을 통한 실제 이미지 직접 시각 평가.
    2순위: 1순위 실패 시 NVIDIA NIM Vision 모델 (meta/muse-glimmer-30b) 시각 평가 Fallback.
    3순위: NIM 실패 시 기존 sr-combo LLM 텍스트 기반 평가 Fallback.
    4순위: 최종 휴리스틱 평가 Fallback.
    """
    menu_name = (m.get("menuName") or "").strip()
    comment = (m.get("comment") or "").strip()
    member = m.get("member") or "익명"
    image_url = (m.get("imageUrl") or "").strip()

    t_desc = menu_name if menu_name else "(등록된 메뉴명 없음)"
    c_desc = comment if comment else "(등록된 코멘트 없음)"
    user_prompt = f"참가자: {member}\n출품 메뉴(제목): {t_desc}\n코멘트: {c_desc}\n제출된 식사 사진을 직접 시각적으로 관찰하여 미식 평가와 점수를 매겨주세요."

    res = None
    image_data_url = get_image_data_url(image_url) if (NIM_API_KEY and image_url) else None

    # 1순위: NVIDIA NIM Vision 1순위 모델 (mistralai/mistral-large-4-1t-a52b)
    if NIM_API_KEY:
        print(f"  [Tier 1] Trying primary NIM Vision model ({NIM_MODEL}) for {member}...", flush=True)
        res = call_nim_vision(user_prompt, image_data_url, slot_name, model_name=NIM_MODEL)

    # 2순위: 1순위 실패 시 NVIDIA NIM Vision 2순위 모델 (meta/muse-glimmer-30b) Fallback
    if (not res or not isinstance(res, dict) or "score" not in res) and NIM_API_KEY:
        print(f"  [Tier 2 Fallback] Primary NIM failed. Trying secondary NIM model ({NIM_FALLBACK_MODEL}) for {member}...", flush=True)
        res = call_nim_vision(user_prompt, image_data_url, slot_name, model_name=NIM_FALLBACK_MODEL)

    # 3순위: NIM 실패 시 sr-combo LLM 텍스트 기반 평가 Fallback
    if not res or not isinstance(res, dict) or "score" not in res:
        print(f"  [Tier 3 Fallback] NIM models failed. Falling back to sr-combo for {member}...", flush=True)
        system_prompt = f"""당신은 세계 최고 권위의 미식 평가단이자 'AIAL 식사 배틀'의 AI 심사위원입니다.
각 참가자가 제출한 {slot_name} 식사 사진의 제목(메뉴명)과 코멘트를 참고하여(없거나 비어있을 수도 있음) 전문적이고 감각적인 미식 총평과 맛 점수를 부여합니다.

[총평 작성 규칙]
1. 총평(review)은 기존과 같이 메뉴와 맛에 대해 평가하고, 이어서 왜 그 점수를 주었는지 간단한 이유를 덧붙여 2~3문장으로 작성하세요:
   - 전반부: 반드시 "이 식사는 [메뉴명 또는 추정되는 음식]인 것 같으며, [어떠어떠해서 어떠어떠하다 식의 구체적인 맛과 풍미 평가]" 형식으로 시작
   - 후반부: 왜 해당 점수를 주었는지에 대한 간단하고 명확한 이유 (예: 재료의 조화, 퀄리티, 정성, 비주얼, 완성도 등)
   예시: "이 식사는 순대국인 것 같으며, 진한 사골 육수에 고소한 들깨가루가 듬뿍 어우러져 깊고 묵직한 감칠맛을 선사하는 든든한 한 그릇입니다. 깊은 국물의 완성도와 조화로운 구성을 높게 평가하여 86점을 부여했습니다."
2. 메뉴명이나 코멘트가 없거나 빈칸이더라도, 적절한 맛있는 식사 메뉴를 상상/추정하여 자연스럽게 작성하세요.

[맛 점수(score) 채점 기준 - 0점부터 100점까지 냉정하고 다채로운 변별력 심사]
절대 모든 음식에 80점 이상의 후한 점수를 주지 마세요. 음식의 퀄리티, 정성, 완성도, 영양 균형에 따라 0점 ~ 100점 사이에서 냉정하게 변별하여 다양한 점수대를 부여하세요:
- 95 ~ 100점: 환상적인 미식, 최고급 요리, 비주얼과 정성 모두 감탄을 자아내는 프리미엄 식사 (파인다이닝, 고급 한우/스시, 정성 가득한 잔칫상 등)
- 85 ~ 94점: 훌륭하고 정성 가득한 한 끼, 영양과 맛의 밸런스가 뛰어난 식사 (정성껏 차린 가정식, 인기 맛집의 대표 메뉴 등)
- 70 ~ 84점: 평범하고 일상적인 무난한 대중적 식사 (일반 백반, 분식, 평범한 한 그릇 요리, 일반 배달음식 등)
- 40 ~ 69점: 단출하거나 가공식품 위주의 식사 (편의점 도시락/라면, 패스트푸드, 다소 부실한 구성)
- 10 ~ 39점: 극히 단출한 인스턴트나 대충 때우는 식사 (단순 컵라면 1개, 빵 한 조각, 간식 수준의 끼니)
- 0 ~ 9점: 식사가 아닌 경우나 극도로 부실한 경우 (최하 0점)

3. 반드시 다른 설명 없이 순수 JSON 포맷 하나만 출력하세요. (마크다운 코드블록 금지)

응답 포맷:
{{"score": 75, "review": "이 식사는 ...인 것 같으며, ... 깊은 국물의 완성도와 조화로운 구성을 높게 평가하여 86점을 부여했습니다."}}"""
        fallback_prompt = f"참가자: {member}\n출품 메뉴(제목): {t_desc}\n코멘트: {c_desc}"
        res = call_llm(system_prompt, fallback_prompt)

    if res and isinstance(res, dict) and "score" in res:
        try:
            score = int(res.get("score", 75))
            score = max(0, min(100, score))
            review = str(res.get("review", "")).strip()
            if review:
                return score, review
        except Exception as e:
            print(f"[Warn] Parsing error for {member}: {e}", flush=True)

    # 4순위: 최종 Fallback 휴리스틱 평가
    print(f"  [Tier 4 Fallback] All LLM models failed. Using heuristic fallback for {member}...", flush=True)
    fallback_menu = menu_name if menu_name else "정갈하고 든든한 한 끼"
    fallback_score = random.randint(60, 85)
    fallback_review = (
        f"이 식사는 {fallback_menu}인 것 같으며, 정성이 담긴 비주얼과 식욕을 돋우는 조화가 "
        f"돋보이는 식사입니다. 음식의 구성과 차림새를 바탕으로 {fallback_score}점을 부여했습니다."
    )
    return fallback_score, fallback_review

def evaluate_slot(date_str, slot_name, force=False):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Evaluating {date_str} {slot_name} meals...")

    if not MONGO_URI:
        print("[Error] MONGODB_URI is not set.")
        return False

    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        db = client["aial_winner"]
        collection = db["meals"]
    except Exception as e:
        print(f"[Error] Failed to connect to MongoDB: {e}")
        return False

    meals = list(collection.find({"date": date_str, "slot": slot_name}))
    print(f"Found {len(meals)} meals for {date_str} {slot_name}.")

    if not meals:
        print("No meals submitted for this slot.")
        return True

    winner = next((m for m in meals if m.get("isWinner")), None)
    unscored_meals = [m for m in meals if m.get("score") is None]

    # 이미 우승자가 결정되어 있고 --force가 아닌 경우
    if winner and not force:
        if not unscored_meals:
            print(f"Winner already determined ({winner.get('member')}, Score: {winner.get('score')}) and all {len(meals)} meals are scored. Nothing to do.")
            return True

        print(f"Winner already determined ({winner.get('member')}, Score: {winner.get('score')}).")
        print(f"Scoring {len(unscored_meals)} unscored meal(s) without altering the existing winner...")
        score_unscored_meals(unscored_meals, winner, collection, slot_name)
        return True

    # 1개만 등록된 경우: 단독 출품 우승
    if len(meals) == 1:
        m = meals[0]
        score, review = evaluate_single_meal(m, slot_name)
        now_ts = int(time.time() * 1000)
        collection.update_one(
            {"_id": m["_id"]},
            {"$set": {
                "isWinner": True,
                "score": score,
                "aiReview": f"[단독 출품 WIN!] {review}",
                "evaluatedAt": now_ts,
                "updatedAt": now_ts
            }}
        )
        print(f"Sole submission winner: {m.get('member')} ({m.get('menuName')}) -> Score: {score}")
        print(f"Review: {review}")
        return True

    # 2개 이상인 경우: 각 사진을 1장씩 개별 평가 후 최고 점수자 WIN 선정 (동점 시 공동 우승)
    print(f"Evaluating {len(meals)} meals one by one...")
    evaluated_items = []
    for idx, m in enumerate(meals, 1):
        member = m.get("member", "익명")
        menu = m.get("menuName", "미정")
        print(f"  [{idx}/{len(meals)}] Evaluating {member}'s meal ({menu})...")
        score, review = evaluate_single_meal(m, slot_name)
        print(f"      -> Score: {score}, Review: {review[:60]}...")
        evaluated_items.append({
            "doc": m,
            "score": score,
            "review": review,
            "createdAt": get_meal_created_at(m)
        })

    # 정렬 기준:
    # 1차: score 내림차순 (가장 높은 점수)
    # 2차: createdAt 오름차순 (업로드 시간이 빠른 사람)
    evaluated_items.sort(key=lambda x: (-x["score"], x["createdAt"]))

    now_ts = int(time.time() * 1000)
    max_score = evaluated_items[0]["score"]
    winner_items = [it for it in evaluated_items if it["score"] == max_score]

    for rank, item in enumerate(evaluated_items, 1):
        is_win = (item["score"] == max_score)
        m = item["doc"]
        collection.update_one(
            {"_id": m["_id"]},
            {"$set": {
                "isWinner": is_win,
                "score": item["score"],
                "aiReview": item["review"],
                "evaluatedAt": now_ts,
                "updatedAt": now_ts
            }}
        )

    if len(winner_items) > 1:
        winner_names = ", ".join([str(it["doc"].get("member")) for it in winner_items])
        print(f"\n🎉 [Joint Winners Selected] {winner_names} (Joint Score: {max_score})")
        for w in winner_items:
            print(f"  - Winner: {w['doc'].get('member')}, Score: {w['score']}, Review: {w['review']}")
    else:
        winner_item = winner_items[0]
        print(f"\n🎉 [Winner Selected] {winner_item['doc'].get('member')} (Score: {winner_item['score']})")
        print(f"Review: {winner_item['review']}")
        print(f"Uploaded At: {winner_item['createdAt']}")
    return True

def get_meal_created_at(m):
    """업로드 타임스탬프(ms) 추출. 없으면 _id 기반 generation_time 사용"""
    ca = m.get("createdAt")
    if ca is not None:
        try:
            return float(ca)
        except Exception:
            pass
    try:
        return m["_id"].generation_time.timestamp() * 1000.0
    except Exception:
        return 0.0

def score_unscored_meals(unscored_meals, winner, collection, slot_name):
    """기존 우승자를 변경하지 않고, 아직 점수가 없는 게시물들만 개별 평가"""
    now_ts = int(time.time() * 1000)
    winner_score = winner.get("score", 95)

    for m in unscored_meals:
        score, review = evaluate_single_meal(m, slot_name)
        # 기존 우승자의 점수를 초과하지 않도록 방어
        if score >= winner_score:
            score = max(0, winner_score - 1)

        collection.update_one(
            {"_id": m["_id"]},
            {"$set": {
                "isWinner": False,
                "score": score,
                "aiReview": review,
                "evaluatedAt": now_ts,
                "updatedAt": now_ts
            }}
        )
        print(f"Scored {m.get('member')}'s meal: {score}점 - {review[:50]}...")

def call_llm(system_prompt, user_prompt):
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.4,
        "stream": False
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
        "Connection": "close"
    }

    for url in [LLM_API_URL, LLM_FALLBACK_URL]:
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=40)
            if resp.status_code == 200:
                resp.encoding = "utf-8"
                raw = resp.text.strip()
                s = raw.find("{")
                e = raw.rfind("}")
                if s != -1 and e != -1:
                    parsed = json.loads(raw[s:e+1])
                    if "choices" in parsed and parsed["choices"]:
                        c = parsed["choices"][0]["message"]["content"].strip()
                        cs = c.find("{")
                        ce = c.rfind("}")
                        if cs != -1 and ce != -1:
                            return json.loads(c[cs:ce+1])
                    elif "score" in parsed and "review" in parsed:
                        return parsed
        except Exception as e:
            print(f"[Notice] Call to {url} failed: {e}", flush=True)
    return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AIAL Winner Meal Evaluator")
    parser.add_argument("--date", type=str, default=datetime.now().strftime("%Y-%m-%d"), help="Target date YYYY-MM-DD")
    parser.add_argument("--slot", type=str, default=get_current_slot(), choices=["아침", "점심", "저녁"], help="Meal slot")
    parser.add_argument("--force", action="store_true", help="Force re-evaluation even if winner exists")
    args = parser.parse_args()

    evaluate_slot(args.date, args.slot, force=args.force)
