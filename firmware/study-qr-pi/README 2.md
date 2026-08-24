# 스터디 QR 표시기 (라즈베리파이)

`firmware/study-qr` 의 ESP32 펌웨어와 **같은 일을 하는 파이썬 판**이다.
QR 코드 스킴이 동일하므로 서버는 두 장비를 구분하지 않는다.

> **스킴을 고칠 때는 세 곳을 함께 고쳐야 한다.**
> 서버 `src/lib/attendance/code.ts` · ESP32 `firmware/study-qr/src/main.cpp` ·
> 이 디렉터리의 `qr_kiosk.py`. 하나라도 어긋나면 그 장비의 QR 은 전부 거부된다.

## 왜 파이인가

ESP32 는 SPI 디스플레이를 직접 구동해야 해서 패널·배선 문제에 취약하다.
파이는 공식 디스플레이가 드라이버 없이 붙고, 한글 폰트와 큰 화면을 쓸 수 있다.
대신 전력을 더 먹고 SD 카드 수명 이슈가 있으므로, 상시 구동 장치로는 트레이드오프가 있다.

## 설치

```bash
sudo apt install -y python3-qrcode python3-pil.imagetk python3-requests fonts-noto-cjk
mkdir -p ~/study-qr && cp qr_kiosk.py ~/study-qr/
cp config.ini.example ~/study-qr/config.ini    # 값을 채운다
chmod 600 ~/study-qr/config.ini
```

`fonts-noto-cjk` 를 빼먹으면 한글이 전부 두부(□)로 나온다. 기본 이미지에는
한글 글리프가 있는 폰트가 하나도 없다.

`config.ini` 의 `secret` 은 서버 `.env` 의 `ATTENDANCE_DEVICE_SECRETS` 에
`방번호:시크릿` 으로 등록한 값과 같아야 한다.

## 자동 실행

```bash
sudo raspi-config nonint do_boot_behaviour B4     # 데스크톱 자동 로그인
mkdir -p ~/.config/autostart && cp study-qr.desktop ~/.config/autostart/
```

## 화면 없이 검증하기

실제 디스플레이가 없어도 가상 프레임버퍼로 렌더링해 스크린샷을 찍을 수 있다.
레이아웃과 폰트 문제를 물리 화면 없이 잡을 수 있어 유용하다.

```bash
sudo apt install -y xvfb imagemagick
Xvfb :99 -screen 0 800x480x24 &
DISPLAY=:99 python3 ~/study-qr/qr_kiosk.py &
sleep 8 && DISPLAY=:99 import -window root shot.png
```

공식 7인치 디스플레이는 **800x480** 이다. 세로가 좁아 세로로 쌓는 배치는
QR 에 줄 공간이 없다. 현재 배치는 왼쪽 정사각형 QR + 오른쪽 글자다.

## 전원

파이는 USB-PD 협상을 하지 않는다. GaN 충전기라도 협상 없이 5V 로 뽑으면
2A 남짓으로 제한되고, micro-USB 케이블의 전압 강하까지 겹치면 저전압에 걸린다.

- 파이 3: 5V **2.5A** 이상 / 파이 4: 5V **3A** 이상
- 7인치 디스플레이: +0.5A. **디스플레이는 자체 전원으로 먹이는 편이 안전하다**
- 공식 어댑터가 5.0V 가 아니라 **5.1V** 인 것은 케이블 강하를 보상하기 위해서다

저전압 여부는 아래로 확인한다. `0x0` 이 아니면 전원이 부족한 것이다.

```bash
vcgencmd get_throttled
```

| 비트 | 의미 |
|---|---|
| `0x1` | 지금 저전압 |
| `0x4` | 지금 주파수 제한 |
| `0x10000` | 저전압이 발생한 적 있음 |
| `0x40000` | 제한이 걸린 적 있음 |
