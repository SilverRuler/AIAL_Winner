#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIAL_Winner Telegram Notification Service
Watches MongoDB 'meals' collection for:
 1) New meal submissions
 2) New meal comments
Sends instant Telegram alerts with meal photo and details.
Runs as a background daemon via PM2 on oci2.
"""

import os
import sys
import time
import json
import html
import requests
from datetime import datetime
from pymongo import MongoClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "state.json")
ENV_FILE = os.path.join(BASE_DIR, ".env")

def load_env():
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

load_env()

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "")
CHAT_ID = os.environ.get("CHAT_ID", "")
MONGO_URI = os.environ.get("MONGODB_URI", "")
SITE_URL = os.environ.get("SITE_URL", "https://win.silverruler.xyz")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "4"))

if not TELEGRAM_TOKEN or not CHAT_ID:
    print("[Error] TELEGRAM_TOKEN and CHAT_ID must be configured.")
    sys.exit(1)

def get_state(db):
    last_seen_ts = 0.0
    last_comment_ts = 0.0

    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                last_seen_ts = float(data.get("last_seen_ts", 0))
                last_comment_ts = float(data.get("last_comment_ts", 0))
        except Exception as e:
            print(f"[Warning] Failed to read state file: {e}")

    # Initialize last_seen_ts if not set
    if last_seen_ts <= 0:
        try:
            latest = db.meals.find_one(sort=[("createdAt", -1)])
            if latest and "createdAt" in latest:
                last_seen_ts = float(latest["createdAt"])
            else:
                last_seen_ts = time.time() * 1000
        except Exception:
            last_seen_ts = time.time() * 1000

    # Initialize last_comment_ts if not set
    if last_comment_ts <= 0:
        try:
            latest_c_meal = db.meals.find_one(
                {"comments.0": {"$exists": True}},
                sort=[("comments.createdAt", -1)]
            )
            max_c_ts = 0.0
            if latest_c_meal and "comments" in latest_c_meal:
                for c in latest_c_meal["comments"]:
                    max_c_ts = max(max_c_ts, float(c.get("createdAt", 0)))
            if max_c_ts > 0:
                last_comment_ts = max_c_ts
            else:
                last_comment_ts = time.time() * 1000
        except Exception:
            last_comment_ts = time.time() * 1000

    save_state(last_seen_ts, last_comment_ts)
    return last_seen_ts, last_comment_ts

def save_state(last_seen_ts, last_comment_ts):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "last_seen_ts": last_seen_ts,
                "last_comment_ts": last_comment_ts,
                "updated_at": datetime.now().isoformat()
            }, f, indent=2)
    except Exception as e:
        print(f"[Warning] Failed to save state file: {e}")

def send_telegram_alert(meal):
    member = html.escape(str(meal.get("member", "익명")))
    date_str = html.escape(str(meal.get("date", "")))
    time_str = html.escape(str(meal.get("time", "")))
    slot = meal.get("slot", "식사")
    menu_name = html.escape(str(meal.get("menuName", "오늘의 한 끼")))
    comment = html.escape(str(meal.get("comment", "")).strip())
    image_url = meal.get("imageUrl", "")

    slot_emoji = {"아침": "🌅", "점심": "☀️", "저녁": "🌙"}.get(slot, "🍽️")

    caption = (
        f"🍽️ <b>[AIAL Winner] 새 식사 사진 등록!</b>\n\n"
        f"👤 <b>멤버</b>: {member}\n"
        f"{slot_emoji} <b>타임대</b>: {date_str} {slot} ({time_str})\n"
        f"🍲 <b>메뉴명</b>: {menu_name}\n"
    )
    if comment:
        caption += f"💬 <b>한마디</b>: {comment}\n"
    caption += f"\n👉 <a href='{SITE_URL}'>AIAL Winner 사이트 확인</a>"

    send_photo_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
    send_msg_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"

    success = False

    # Try sending photo with caption if valid URL exists
    if image_url and (image_url.startswith("http://") or image_url.startswith("https://")):
        try:
            resp = requests.post(
                send_photo_url,
                data={
                    "chat_id": CHAT_ID,
                    "photo": image_url,
                    "caption": caption,
                    "parse_mode": "HTML"
                },
                timeout=15
            )
            if resp.status_code == 200:
                success = True
                print(f"[Telegram] Photo sent successfully for {member} ({menu_name})")
            else:
                print(f"[Telegram] Photo send failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[Telegram] Error calling sendPhoto: {e}")

    # Fallback to text message if photo send failed or no photo URL
    if not success:
        try:
            resp = requests.post(
                send_msg_url,
                data={
                    "chat_id": CHAT_ID,
                    "text": caption,
                    "parse_mode": "HTML"
                },
                timeout=10
            )
            if resp.status_code == 200:
                print(f"[Telegram] Text alert sent for {member} ({menu_name})")
            else:
                print(f"[Telegram] Message send failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[Telegram] Error calling sendMessage: {e}")

def send_telegram_comment_alert(meal, comment_doc):
    target_member = html.escape(str(meal.get("member", "익명")))
    slot = meal.get("slot", "식사")
    menu_name = html.escape(str(meal.get("menuName", "오늘의 한 끼")))
    date_str = html.escape(str(meal.get("date", "")))
    image_url = meal.get("imageUrl", "")

    author = html.escape(str(comment_doc.get("author", "익명")))
    masked_ip = comment_doc.get("maskedIp", "")
    if masked_ip:
        author_display = f"{author}({html.escape(str(masked_ip))})"
    else:
        author_display = author

    content = html.escape(str(comment_doc.get("content", "")).strip())
    slot_emoji = {"아침": "🌅", "점심": "☀️", "저녁": "🌙"}.get(slot, "🍽️")

    caption = (
        f"💬 <b>[AIAL Winner] 새 댓글 등록!</b>\n\n"
        f"📌 <b>대상 식사</b>: {target_member}님의 {slot_emoji} {slot} ({menu_name})\n"
        f"✍️ <b>작성자</b>: <b>{author_display}</b>\n"
        f"📝 <b>댓글 내용</b>:\n{content}\n\n"
        f"👉 <a href='{SITE_URL}'>AIAL Winner 사이트 확인</a>"
    )

    send_photo_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
    send_msg_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"

    success = False

    # Try sending photo with caption if valid URL exists
    if image_url and (image_url.startswith("http://") or image_url.startswith("https://")):
        try:
            resp = requests.post(
                send_photo_url,
                data={
                    "chat_id": CHAT_ID,
                    "photo": image_url,
                    "caption": caption,
                    "parse_mode": "HTML"
                },
                timeout=15
            )
            if resp.status_code == 200:
                success = True
                print(f"[Telegram] Comment photo alert sent: [{author_display}] on [{target_member}'s {menu_name}]")
            else:
                print(f"[Telegram] Comment photo send failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[Telegram] Error calling sendPhoto for comment: {e}")

    # Fallback to text message if photo send failed or no photo URL
    if not success:
        try:
            resp = requests.post(
                send_msg_url,
                data={
                    "chat_id": CHAT_ID,
                    "text": caption,
                    "parse_mode": "HTML"
                },
                timeout=10
            )
            if resp.status_code == 200:
                print(f"[Telegram] Comment text alert sent: [{author_display}] on [{target_member}'s {menu_name}]")
            else:
                print(f"[Telegram] Comment message send failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[Telegram] Error calling sendMessage for comment: {e}")

def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting AIAL Winner Telegram Notifier...")
    sys.stdout.flush()

    if not MONGO_URI:
        print("[Error] MONGODB_URI not found.")
        sys.exit(1)

    client = MongoClient(MONGO_URI)
    db = client.get_default_database()

    last_seen_ts, last_comment_ts = get_state(db)
    print(f"Watching meals (ts > {last_seen_ts}) & comments (ts > {last_comment_ts}) [Interval: {POLL_INTERVAL}s]")
    sys.stdout.flush()

    seen_comment_ids = set()

    while True:
        try:
            # 1. Check for new meal submissions
            meal_cursor = db.meals.find({"createdAt": {"$gt": last_seen_ts}}).sort("createdAt", 1)
            new_meals = list(meal_cursor)

            for meal in new_meals:
                created_at = float(meal.get("createdAt", 0))
                print(f"New meal detected: {meal.get('member')} - {meal.get('menuName')} (ts: {created_at})")
                send_telegram_alert(meal)
                last_seen_ts = max(last_seen_ts, created_at)
                save_state(last_seen_ts, last_comment_ts)

            # 2. Check for new comments across all meals
            comment_cursor = db.meals.find({"comments.createdAt": {"$gt": last_comment_ts}})
            meals_with_comments = list(comment_cursor)

            new_comments = []
            for meal in meals_with_comments:
                for c in meal.get("comments", []):
                    c_id = c.get("id")
                    c_ts = float(c.get("createdAt", 0))
                    if c_ts > last_comment_ts and (not c_id or c_id not in seen_comment_ids):
                        new_comments.append((c_ts, meal, c))

            # Process comments chronologically
            new_comments.sort(key=lambda x: x[0])

            for c_ts, meal, c in new_comments:
                c_id = c.get("id")
                if c_id:
                    seen_comment_ids.add(c_id)
                print(f"New comment detected on {meal.get('member')}'s meal by {c.get('author')} (ts: {c_ts})")
                send_telegram_comment_alert(meal, c)
                last_comment_ts = max(last_comment_ts, c_ts)
                save_state(last_seen_ts, last_comment_ts)

            # Keep seen_comment_ids from growing unbounded
            if len(seen_comment_ids) > 500:
                seen_comment_ids.clear()

        except Exception as e:
            print(f"[Error in polling loop] {e}")
            sys.stdout.flush()
            time.sleep(5)

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
