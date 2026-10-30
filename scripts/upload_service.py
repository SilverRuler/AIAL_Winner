#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIAL_Winner Image Upload Service
Runs on oci2 at 127.0.0.1:20135
Receives meal images, converts HEIC/HEIF/PNG/WebP/JPEG to web-safe JPEG,
handles EXIF orientation, and returns HTTPS image URL.
"""

import os
import sys
import json
import base64
import re
import io
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image, ImageOps
import pillow_heif

# Register HEIF / HEIC opener for PIL
pillow_heif.register_heif_opener()

UPLOAD_DIR = "/root/winner_aial"
PORT = 20135

class UploadHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/upload" and self.path != "/upload":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"success": false, "message": "Not Found"}')
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0 or content_length > 35 * 1024 * 1024:  # max 35MB
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"success": false, "message": "Invalid content length"}')
                return

            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))

            date_str = data.get("date", "").strip()
            if not date_str or not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
                from datetime import datetime
                date_str = datetime.now().strftime("%Y-%m-%d")

            meal_id = data.get("mealId", "").strip()
            if not meal_id:
                import time
                meal_id = f"meal_{int(time.time()*1000)}"

            image_data = data.get("imageBase64", "")
            if not image_data:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"success": false, "message": "imageBase64 is required"}')
                return

            # Strip base64 header if present
            if "," in image_data:
                b64_content = image_data.split(",", 1)[1]
            else:
                b64_content = image_data

            img_bytes = base64.b64decode(b64_content)

            # Ensure date folder exists
            target_dir = os.path.join(UPLOAD_DIR, date_str)
            os.makedirs(target_dir, exist_ok=True)

            filename = f"{meal_id}.jpg"
            filepath = os.path.join(target_dir, filename)

            # Process with Pillow to ensure valid JPEG and correct EXIF orientation
            try:
                img = Image.open(io.BytesIO(img_bytes))
                # Auto-rotate based on EXIF (prevents sideways iPhone photos)
                img = ImageOps.exif_transpose(img)

                # Convert to RGB if needed (RGBA, P, CMYK, etc.)
                if img.mode != "RGB":
                    img = img.convert("RGB")

                # Resize if excessively large (max 1920px)
                max_dim = 1920
                if img.width > max_dim or img.height > max_dim:
                    img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                img.save(filepath, "JPEG", quality=85, optimize=True)
                os.chmod(filepath, 0o644)
                file_size = os.path.getsize(filepath)
            except Exception as conv_err:
                sys.stderr.write(f"[Warn] Pillow conversion failed: {conv_err}. Saving raw bytes.\n")
                sys.stderr.flush()
                with open(filepath, "wb") as f:
                    f.write(img_bytes)
                os.chmod(filepath, 0o644)
                file_size = len(img_bytes)

            public_url = f"https://oci2.silverruler.xyz/images/{date_str}/{filename}"

            response_data = {
                "success": True,
                "url": public_url,
                "date": date_str,
                "filename": filename,
                "size": file_size
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            err_resp = {"success": False, "message": str(e)}
            self.wfile.write(json.dumps(err_resp).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def log_message(self, format, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))
        sys.stdout.flush()

if __name__ == "__main__":
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, UploadHandler)
    print(f"AIAL Image Upload Server listening on 127.0.0.1:{PORT}...")
    sys.stdout.flush()
    httpd.serve_forever()
