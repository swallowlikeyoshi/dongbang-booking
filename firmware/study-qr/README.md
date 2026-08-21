# 스터디 QR 표시 장비

LOLIN D32 + 2.4" ILI9341(240×320) SPI. 60초마다 서명된 6자리 코드를 QR로 표시한다.

## 배선

핀 번호는 `src/config.h` 에 있다(빌드 플래그가 아니라). 배선이 다른 장비를 만들면 그 파일만 고치면 된다.
아래 값은 클러스터 PCB(HEVEN `firmware/cluster` origin/main)에서 실물 검증된 배정이다.

| ILI9341 모듈 | ESP32 |
|---------|-----------|
| VCC | 3V3 |
| GND | GND |
| CS | GPIO4 |
| RESET | GPIO16 |
| D/C (RS) | GPIO5 |
| SDI (MOSI) | GPIO19 |
| SCK (CLK) | GPIO21 |
| SDO (MISO) | GPIO22 (읽기는 안 쓰지만 SPI.begin 에 넘긴다) |
| LED | 3V3 직결 |

모듈 실크와 표기가 다르니 주의: 실크의 `D/C` 가 DC, `RESET` 이 RST 다. 이 둘이 바뀌면
백라이트만 켜진 백색 화면이 되고 다른 증상은 나오지 않는다.

**라이브러리는 Adafruit_ILI9341 을 쓴다.** TFT_eSPI 는 핀 설정을 컴파일 타임 매크로로
주입하는 구조라 조용히 어긋나기 쉬워 채택하지 않았다. 클러스터 펌웨어가 같은 경로로
동작하는 것이 실물로 확인되어 있다.

패널 색이 반전되어 보이면 `config.h` 의 `TFT_INVERT` 주석을 해제한다.
QR 은 반전되어도 대부분의 스캐너가 읽지만, 배경/전경이 뒤집히면 가독성이 떨어진다.

### 배선 진단

화면이 안 나올 때는 진단 스케치로 원인을 좁힌다:

```bash
pio run -e diag -t upload      # GPIO 되읽기 + 색 순환
```

색이 순환하면 SPI 경로는 정상이므로 애플리케이션 코드 문제이고,
계속 백색이면 배선이나 모듈 문제다.

## 빌드

```bash
cp src/config.h.example src/config.h   # 값을 채운다
pio run -t upload
pio device monitor
```

`DEVICE_SECRET` 은 서버 `.env` 의 `ATTENDANCE_DEVICE_SECRETS` 에 `방번호:시크릿` 형태로 등록한 값과 같아야 한다.

## 동작

- 부팅 시 Wi-Fi 접속 후 NTP 동기화. 실패하면 QR 대신 "TIME SYNC FAILED"를 띄운다.
  틀린 QR을 띄우면 반복 실패로 신뢰를 잃기 때문에 아무것도 띄우지 않는 쪽을 택했다.
- 1시간마다 NTP 재동기화(RTC 없음).
- 5분마다 하트비트를 보내고 응답의 재실 인원을 하단에 표시한다.

## 화면 텍스트가 전부 영문인 이유

TFT_eSPI에 기본 내장된 폰트는 ASCII 전용이라 한글 글리프가 없다. 한글 VLW 폰트 서브셋을
생성해 끼워 넣는 빌드 단계는 이번 계획 범위 밖이라, 화면에 그리는 문자열은 전부 ASCII로
바꿨다(`ROOM_NAME "24214"`, `"Scan with camera app"`, `"TIME SYNC FAILED"` /
`"Report manually"`). "기본 카메라로 스캔" 같은 한글 안내는 화면 옆에 붙이는 인쇄 라벨로
대체하는 것을 전제로 한다. 한글 VLW 폰트를 만들어 화면에 직접 표시하는 것은 추후
개선 과제로 남겨둔다.
