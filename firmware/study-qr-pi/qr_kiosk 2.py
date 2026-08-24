#!/usr/bin/env python3
"""라즈베리파이용 스터디 QR 표시기.

ESP32 펌웨어(firmware/study-qr)와 **동일한 코드 스킴**을 쓴다. 서버는 두 장비를
구분하지 않으며, 어느 쪽이든 같은 시크릿으로 같은 슬롯에서 같은 코드를 낸다.
스킴을 고칠 일이 생기면 세 곳(서버 code.ts · ESP32 main.cpp · 이 파일)을 함께 고쳐야 한다.

설정은 같은 디렉터리의 config.ini 에서 읽는다.
"""
import configparser
import hashlib
import hmac
import io
import pathlib
import sys
import time
import tkinter as tk

import qrcode
import requests
from PIL import Image, ImageTk
import tkinter.font as tkfont

# 서버 src/lib/attendance/code.ts 와 반드시 동일해야 한다.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
SLOT_SECONDS = 60
CODE_LENGTH = 6

HEARTBEAT_INTERVAL = 300
FIRMWARE_VER = "study-qr-pi-1.0.0"

BASE = pathlib.Path(__file__).resolve().parent
cfg = configparser.ConfigParser()
if not cfg.read(BASE / "config.ini"):
    sys.exit("config.ini 가 없습니다. config.ini.example 을 복사해 채우세요.")

DEVICE_SECRET = cfg["device"]["secret"]
ROOM_NAME = cfg["device"]["room_name"]
BASE_URL = cfg["device"]["base_url"].rstrip("/") + "/"
HEARTBEAT_URL = cfg["device"]["heartbeat_url"]


def code_for_slot(slot: int) -> str:
    """HMAC-SHA256(secret, 슬롯의 10진 문자열) 의 앞 6바이트를 알파벳에 매핑."""
    mac = hmac.new(DEVICE_SECRET.encode(), str(slot).encode(), hashlib.sha256).digest()
    return "".join(ALPHABET[b % 32] for b in mac[:CODE_LENGTH])


def time_is_synced() -> bool:
    """시각이 틀리면 코드가 전부 어긋난다. 틀린 QR 을 띄우느니 아무것도 띄우지 않는다."""
    try:
        with open("/run/systemd/timesync/synchronized"):
            return True
    except OSError:
        # timesyncd 를 안 쓰는 환경이면 epoch 가 그럴듯한지로 대신 판단한다.
        return time.time() > 1_700_000_000


def pick_font(root: tk.Tk) -> str:
    """한글 글리프가 있는 폰트를 고른다. 없으면 이름이 아니라 두부(□)가 찍힌다."""
    available = set(tkfont.families(root))
    for name in ("Noto Sans CJK KR", "Noto Sans KR", "NanumGothic",
                 "Noto Sans CJK JP", "DejaVu Sans"):
        if name in available:
            return name
    return "TkDefaultFont"


class Kiosk:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.last_slot = -1
        self.last_heartbeat = 0.0
        self.occupancy = -1
        self.photo = None

        # 화면 크기를 먼저 확정한다. 창이 매핑되기 전에는 winfo_* 가 1 을 돌려줘
        # QR 크기 계산이 어긋난다.
        self.sw = root.winfo_screenwidth()
        self.sh = root.winfo_screenheight()

        font = pick_font(root)
        root.configure(bg="white")
        root.geometry(f"{self.sw}x{self.sh}+0+0")
        root.overrideredirect(True)      # 창 관리자가 없어도 전체를 덮는다
        root.attributes("-fullscreen", True)
        root.bind("<Escape>", lambda _e: root.destroy())
        root.config(cursor="none")

        # 800x480 같은 가로 화면에서는 세로로 쌓으면 QR 에 줄 공간이 없다.
        # 왼쪽에 QR 정사각형, 오른쪽에 글자를 두어 QR 을 최대한 키운다.
        pad = 16
        self.qr_px = max(200, self.sh - pad * 2)

        wrap = tk.Frame(root, bg="white")
        wrap.pack(fill="both", expand=True)

        self.canvas = tk.Label(wrap, bg="white")
        self.canvas.pack(side="left", padx=(pad, pad))

        right = tk.Frame(wrap, bg="white")
        right.pack(side="left", fill="both", expand=True, padx=(0, pad))

        text_w = max(200, self.sw - self.qr_px - pad * 3)
        scale = min(max(text_w / 320.0, 0.7), 1.6)

        self.header = tk.Label(right, text=ROOM_NAME, bg="white", fg="black",
                               font=(font, int(28 * scale), "bold"),
                               wraplength=text_w, justify="left", anchor="w")
        self.header.pack(fill="x", pady=(pad * 2, 8))

        self.hint = tk.Label(right, text="기본 카메라 앱으로\n스캔하세요", bg="white",
                             fg="black", font=(font, int(20 * scale)),
                             wraplength=text_w, justify="left", anchor="w")
        self.hint.pack(fill="x")

        self.footer = tk.Label(right, text="", bg="white", fg="#555555",
                               font=(font, int(16 * scale)),
                               wraplength=text_w, justify="left", anchor="w")
        self.footer.pack(fill="x", pady=(12, 0))

        self.tick()

    def draw(self, code: str) -> None:
        img = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_L)
        img.add_data(BASE_URL + code)
        img.make(fit=True)
        pil = img.make_image(fill_color="black", back_color="white").convert("RGB")
        size = self.qr_px
        pil = pil.resize((size, size), Image.NEAREST)
        self.photo = ImageTk.PhotoImage(pil)
        self.canvas.configure(image=self.photo)

        parts = [code]
        if self.occupancy >= 0:
            parts.append(f"현재 {self.occupancy}명")
        self.footer.configure(text="\n".join(parts))

    def show_time_error(self) -> None:
        self.canvas.configure(image="")
        self.header.configure(text="시각 동기화 실패", fg="#cc0000")
        self.hint.configure(text="QR 을 띄울 수 없습니다.\n보정 신고로 기록해주세요.")
        self.footer.configure(text="")

    def heartbeat(self, code: str) -> None:
        try:
            r = requests.post(HEARTBEAT_URL, json={"code": code, "firmware": FIRMWARE_VER}, timeout=8)
            if r.status_code == 200:
                self.occupancy = r.json().get("occupancy", -1)
            else:
                # 실패 시 오래된 인원수를 남겨두지 않는다.
                self.occupancy = -1
        except requests.RequestException:
            self.occupancy = -1

    def tick(self) -> None:
        if not time_is_synced():
            self.show_time_error()
            self.last_slot = -1
            self.root.after(5000, self.tick)
            return

        now = time.time()
        slot = int(now // SLOT_SECONDS)
        if slot != self.last_slot:
            self.last_slot = slot
            code = code_for_slot(slot)
            if now - self.last_heartbeat > HEARTBEAT_INTERVAL or self.last_heartbeat == 0:
                self.last_heartbeat = now
                self.heartbeat(code)
            self.header.configure(text=ROOM_NAME, fg="black")
            self.hint.configure(text="기본 카메라 앱으로\n스캔하세요", fg="black")
            self.draw(code)

        # 슬롯 경계 직후에 깨어나도록 남은 시간에 맞춰 다음 호출을 잡는다.
        remain = SLOT_SECONDS - (now % SLOT_SECONDS)
        self.root.after(int(min(remain, 1.0) * 1000) + 50, self.tick)


if __name__ == "__main__":
    root = tk.Tk()
    root.title("HEVEN 스터디 QR")
    Kiosk(root)
    root.mainloop()
