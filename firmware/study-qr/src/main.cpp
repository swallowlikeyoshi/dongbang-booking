#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <TFT_22_ILI9225.h>
#include <qrcode.h>
#include <mbedtls/md.h>
#include <time.h>

#include "config.h"

// 서버 src/lib/attendance/code.ts 와 반드시 동일해야 한다.
static const char *ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
static const int SLOT_SECONDS = 60;
static const int CODE_LENGTH = 6;

// 4인자 하드웨어 SPI 생성자. 5인자 쪽은 마지막 인자가 LED 핀으로 잘못 해석된다.
static TFT_22_ILI9225 tft = TFT_22_ILI9225(PIN_TFT_RST, PIN_TFT_DC, PIN_TFT_CS, (uint8_t)0);

/** Terminal6x8 고정폭 기준으로 가운데 정렬한다. */
static void drawCentered(const char *s, int y, uint16_t fg) {
  const int charW = 6;
  int w = (int)strlen(s) * charW;
  int x = (SCREEN_W - w) / 2;
  if (x < 0) x = 0;
  tft.drawText(x, y, s, fg);
}
static long lastSlot = -1;
static unsigned long lastHeartbeat = 0;
static int occupancy = -1;
static bool timeReady = false;

static void codeForSlot(long slot, char *out) {
  char slotStr[24];
  snprintf(slotStr, sizeof(slotStr), "%ld", slot);

  uint8_t mac[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, (const uint8_t *)DEVICE_SECRET, strlen(DEVICE_SECRET));
  mbedtls_md_hmac_update(&ctx, (const uint8_t *)slotStr, strlen(slotStr));
  mbedtls_md_hmac_finish(&ctx, mac);
  mbedtls_md_free(&ctx);

  for (int i = 0; i < CODE_LENGTH; i++) out[i] = ALPHABET[mac[i] % 32];
  out[CODE_LENGTH] = '\0';
}

static void drawHeader() {
  tft.fillRectangle(0, 0, SCREEN_W - 1, HEADER_H - 1, COLOR_WHITE);
  tft.setFont(Terminal6x8);
  drawCentered(ROOM_NAME, 3, COLOR_BLACK);
}

static void drawFooter(const char *code) {
  tft.fillRectangle(0, SCREEN_H - FOOTER_H, SCREEN_W - 1, SCREEN_H - 1, COLOR_WHITE);
  tft.setFont(Terminal6x8);
  // ASCII만 표시 가능 (내장 폰트에 한글 글리프 없음).
  // "기본 카메라로 스캔" 안내는 화면 옆 인쇄 라벨로 대체한다.
  drawCentered("Scan with camera", SCREEN_H - FOOTER_H + 3, COLOR_BLACK);

  char line[48];
  if (occupancy >= 0) snprintf(line, sizeof(line), "%s  now %d", code, occupancy);
  else snprintf(line, sizeof(line), "%s", code);
  drawCentered(line, SCREEN_H - FOOTER_H + 14, COLOR_BLACK);
}

/** 시각이 틀리면 코드가 전부 어긋난다. 틀린 QR 을 띄우느니 아무것도 띄우지 않는다. */
static void drawTimeError() {
  tft.fillRectangle(0, 0, SCREEN_W - 1, SCREEN_H - 1, COLOR_WHITE);
  tft.setFont(Terminal6x8);
  drawCentered("TIME SYNC FAILED", SCREEN_H / 2 - 12, COLOR_RED);
  drawCentered("Report manually", SCREEN_H / 2 + 4, COLOR_BLACK);
  lastSlot = -1;
}

static void drawQr(const char *code) {
  char url[128];
  snprintf(url, sizeof(url), "%s%s", BASE_URL, code);

  // 176x220 화면에는 버전 4(33모듈)가 모듈당 5px 밖에 안 나온다.
  // 현재 URL 길이(약 43자)는 버전 3(29모듈)에 들어가고, 그러면 모듈당 6px 로 커진다.
  // BASE_URL 을 늘리면 버전이 올라가 QR 이 작아지므로 53자를 넘기지 않는다.
  QRCode qr;
  uint8_t data[qrcode_getBufferSize(3)];
  qrcode_initText(&qr, data, 3, ECC_LOW, url);

  const int top = HEADER_H;
  const int bandH = SCREEN_H - FOOTER_H - top;
  const int avail = (SCREEN_W < bandH ? SCREEN_W : bandH);
  const int scale = avail / qr.size;
  const int size = qr.size * scale;
  const int ox = (SCREEN_W - size) / 2;
  const int oy = top + (bandH - size) / 2;

  tft.fillRectangle(0, top, SCREEN_W - 1, top + bandH - 1, COLOR_WHITE);
  for (uint8_t y = 0; y < qr.size; y++) {
    for (uint8_t x = 0; x < qr.size; x++) {
      if (qrcode_getModule(&qr, x, y)) {
        int px = ox + x * scale, py = oy + y * scale;
        tft.fillRectangle(px, py, px + scale - 1, py + scale - 1, COLOR_BLACK);
      }
    }
  }
}

static bool syncTime() {
  configTzTime("KST-9", "pool.ntp.org", "time.google.com");
  struct tm info;
  if (!getLocalTime(&info, 10000)) return false;
  return time(nullptr) > 1700000000;
}

static void sendHeartbeat(const char *code) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[hb] skipped — wifi down");
    return;
  }
  HTTPClient http;
  http.begin(HEARTBEAT_URL);
  http.addHeader("Content-Type", "application/json");
  char body[160];
  snprintf(body, sizeof(body), "{\"code\":\"%s\",\"firmware\":\"%s\"}", code, FIRMWARE_VER);
  int status = http.POST(body);
  Serial.printf("[hb] POST -> %d\n", status);
  if (status == 200) {
    String payload = http.getString();
    Serial.printf("[hb] body=%s\n", payload.c_str());
    int idx = payload.indexOf("\"occupancy\":");
    if (idx >= 0) occupancy = payload.substring(idx + 12).toInt();
  } else {
    // 하트비트 실패 시 화면에 남은 재실 인원이 오래된 값일 수 있으므로 지운다.
    occupancy = -1;
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.printf("[boot] %s room=%s\n", FIRMWARE_VER, ROOM_NAME);

  tft.begin();
  tft.setOrientation(TFT_ORIENTATION);
  tft.fillRectangle(0, 0, SCREEN_W - 1, SCREEN_H - 1, COLOR_WHITE);
  drawHeader();
  Serial.printf("[tft] begin ok  %dx%d  RST=%d RS=%d CS=%d\n",
                tft.maxX(), tft.maxY(), PIN_TFT_RST, PIN_TFT_DC, PIN_TFT_CS);

  Serial.printf("[wifi] connecting to %s ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    if (i % 4 == 0) Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] connected, ip=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.printf("[wifi] FAILED (status=%d)\n", WiFi.status());
  }

  timeReady = syncTime();
  Serial.printf("[ntp] %s\n", timeReady ? "ok" : "FAILED");
  if (!timeReady) drawTimeError();
}

void loop() {
  // 시각을 모르는 동안은 30초마다 재시도하고, 한 번 맞춘 뒤에는 1시간마다 재동기화한다
  // (RTC 가 없어 드리프트가 누적됨). 부팅 시 동기화가 실패하면 다음 재시도까지
  // 최대 1시간을 그냥 흘려보내던 문제를 막기 위함 — 무인 장비라 아무도 재부팅해주지 않는다.
  static unsigned long lastSync = 0;
  const unsigned long RESYNC_INTERVAL_MS = 3600UL * 1000UL;
  const unsigned long RETRY_INTERVAL_MS = 30UL * 1000UL;
  unsigned long syncInterval = timeReady ? RESYNC_INTERVAL_MS : RETRY_INTERVAL_MS;
  if (millis() - lastSync > syncInterval) {
    lastSync = millis();
    if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
    bool ok = syncTime();
    Serial.printf("[ntp] resync %s (wifi=%d)\n", ok ? "ok" : "FAILED", WiFi.status());
    if (ok && !timeReady) { tft.fillRectangle(0, 0, SCREEN_W - 1, SCREEN_H - 1, COLOR_WHITE); drawHeader(); lastSlot = -1; }
    timeReady = ok;
    if (!timeReady) drawTimeError();
  }

  if (!timeReady) { delay(1000); return; }

  long slot = (long)(time(nullptr) / SLOT_SECONDS);
  if (slot != lastSlot) {
    lastSlot = slot;
    char code[CODE_LENGTH + 1];
    codeForSlot(slot, code);
    Serial.printf("[qr] slot=%ld code=%s url=%s%s\n", slot, code, BASE_URL, code);
    drawQr(code);
    drawFooter(code);

    if (millis() - lastHeartbeat > 300UL * 1000UL || lastHeartbeat == 0) {
      lastHeartbeat = millis();
      sendHeartbeat(code);
    }
  }
  delay(250);
}
