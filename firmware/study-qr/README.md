# 스터디 QR 표시 장비

LOLIN D32 + 2.4" ILI9341(240×320) SPI. 60초마다 서명된 6자리 코드를 QR로 표시한다.

## 배선

| ILI9341 | LOLIN D32 |
|---------|-----------|
| VCC | 3V3 |
| GND | GND |
| CS | GPIO5 |
| RST | GPIO4 |
| DC(RS) | GPIO2 |
| SDI(MOSI) | GPIO23 |
| CLK | GPIO18 |
| LED | GPIO15 |

둘 다 3.3V라 레벨시프터가 필요 없다. 모듈의 SD 슬롯은 쓰지 않는다.

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
