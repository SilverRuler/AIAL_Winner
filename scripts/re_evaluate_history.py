#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIAL_Winner - Historical Meals Re-evaluation Script
Re-evaluates all historical meals submitted before 2026-10-30 저녁 using NVIDIA NIM Vision model (mistralai/mistral-large-4-1t-a52b).
CRITICAL: Preserves existing winners without any winner changes ('위너 변동X').
Score Range: 0 ~ 100 points.
"""

import os
import sys
import time
from datetime import datetime

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

sys.path.insert(0, "/root/aial_winner_evaluator")
import evaluate_meals
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "mongodb+srv://ghdelqtlr_db_user:6dsTtZ8WKZ8vAupm@cluster0.feyyvz6.mongodb.net/aial_winner?retryWrites=true&w=majority")

client = MongoClient(MONGO_URI)
db = client["aial_winner"]
collection = db["meals"]

TARGET_SLOTS = [
    ("2026-10-25", "점심"),
    ("2026-10-25", "저녁"),
    ("2026-10-26", "점심"),
    ("2026-10-27", "저녁"),
    ("2026-10-28", "점심"),
    ("2026-10-29", "점심"),
    ("2026-10-29", "저녁"),
    ("2026-10-30", "점심"),
]

def re_evaluate_all():
    print("=" * 60)
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Historical Meals Re-evaluation (0~100 Score Range)")
    print("AI Model: NVIDIA NIM (mistralai/mistral-large-4-1t-a52b) with Vision")
    print("Rule: 261030 저녁 이전 게시글 재심사 (위너 변동 없음, 최하 0점 ~ 최대 100점)")
    print("=" * 60)

    total_processed = 0

    for date_str, slot_name in TARGET_SLOTS:
        meals = list(collection.find({"date": date_str, "slot": slot_name}).sort("createdAt", 1))
        if not meals:
            continue

        print(f"\n>>> [{date_str} {slot_name}] Processing {len(meals)} meals...", flush=True)

        # 1개만 등록된 단독 출품인 경우
        if len(meals) == 1:
            m = meals[0]
            member = m.get("member", "익명")
            menu = m.get("menuName", "")
            print(f"  [Sole Submission] Evaluating {member} ({menu})...", flush=True)
            raw_score, review = evaluate_meals.evaluate_single_meal(m, slot_name)
            now_ts = int(time.time() * 1000)
            collection.update_one(
                {"_id": m["_id"]},
                {"$set": {
                    "score": raw_score,
                    "aiReview": f"[단독 출품 WIN!] {review}",
                    "isWinner": True,  # 위너 유지
                    "evaluatedAt": now_ts,
                    "updatedAt": now_ts
                }}
            )
            print(f"    -> Score: {raw_score}, Winner: True (Maintained)", flush=True)
            total_processed += 1
            continue

        # 2개 이상인 경우
        existing_winner = next((m for m in meals if m.get("isWinner")), None)
        winner_id = existing_winner["_id"] if existing_winner else meals[0]["_id"]

        eval_results = []
        for idx, m in enumerate(meals, 1):
            member = m.get("member", "익명")
            menu = m.get("menuName", "")
            is_orig_win = (m["_id"] == winner_id)
            print(f"  [{idx}/{len(meals)}] Evaluating {member} ({menu}) [Orig Winner: {is_orig_win}]...", flush=True)
            raw_score, review = evaluate_meals.evaluate_single_meal(m, slot_name)
            print(f"      -> Raw Score: {raw_score}", flush=True)
            eval_results.append({
                "doc": m,
                "is_winner": is_orig_win,
                "raw_score": raw_score,
                "review": review
            })
            total_processed += 1

        # 위너 점수 보장 (위너 변동 방지)
        winner_item = next((item for item in eval_results if item["is_winner"]), eval_results[0])
        non_winner_items = [item for item in eval_results if not item["is_winner"]]

        max_non_winner_score = max([item["raw_score"] for item in non_winner_items]) if non_winner_items else 0

        final_winner_score = winner_item["raw_score"]
        if non_winner_items and final_winner_score <= max_non_winner_score:
            if max_non_winner_score >= 100:
                final_winner_score = 100
                for item in non_winner_items:
                    if item["raw_score"] >= 100:
                        item["raw_score"] = 99
            else:
                final_winner_score = max_non_winner_score + 1
            print(f"  [Score Adjust] Winner ({winner_item['doc'].get('member')}) score adjusted from {winner_item['raw_score']} to {final_winner_score} to maintain win over non-winner max ({max_non_winner_score})", flush=True)

        winner_item["final_score"] = final_winner_score
        for item in non_winner_items:
            item["final_score"] = max(0, min(final_winner_score - 1, item["raw_score"]))

        # DB 업데이트
        now_ts = int(time.time() * 1000)
        for item in eval_results:
            m = item["doc"]
            collection.update_one(
                {"_id": m["_id"]},
                {"$set": {
                    "score": item["final_score"],
                    "aiReview": item["review"],
                    "isWinner": item["is_winner"],  # 기존 위너 상태 100% 보존
                    "evaluatedAt": now_ts,
                    "updatedAt": now_ts
                }}
            )
            print(f"  -> Updated {m.get('member')}: Score {item['final_score']} (Winner: {item['is_winner']})", flush=True)

    print("\n" + "=" * 60)
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Historical Re-evaluation Completed! Total {total_processed} meals updated.")
    print("=" * 60)

if __name__ == "__main__":
    re_evaluate_all()
