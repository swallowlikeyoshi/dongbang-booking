#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <TFT_eSPI.h>
#include <qrcode.h>
#include <mbedtls/md.h>
#include <time.h>

#include "config.h"

// 서버 src/lib/attendance/code.ts 와 반드시 동일해야 한다.
static const char *ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
static const int SLOT_SECONDS = 60;
static const int CODE_LENGTH = 6;

static TFT_eSPI tft = TFT_eSPI();
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
  tft.fillRect(0, 0, 240, 24, TFT_WHITE);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(ROOM_NAME, 120, 6, 2);
}

static void drawFooter(const char *code) {
  tft.fillRect(0, 268, 240, 52, TFT_WHITE);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextDatum(TC_DATUM);
  // ASCII만 표시 가능 (TFT_eSPI 기본 폰트에는 한글 글리프가 없음).
  // "기본 카메라로 스캔" 안내는 화면 옆에 붙이는 인쇄 라벨로 대체한다.
  tft.drawString("Scan with camera app", 120, 270, 2);

  char line[48];
  if (occupancy >= 0) snprintf(line, sizeof(line), "%s  |  now %d", code, occupancy);
  else snprintf(line, sizeof(line), "%s", code);
  tft.drawString(line, 120, 294, 2);
}

/** 시각이 틀리면 코드가 전부 어긋난다. 틀린 QR 을 띄우느니 아무것도 띄우지 않는다. */
static void drawTimeError() {
  tft.fillScreen(TFT_WHITE);
  tft.setTextColor(TFT_RED, TFT_WHITE);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("TIME SYNC FAILED", 120, 140, 4);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.drawString("Report manually", 120, 175, 2);
}

static void drawQr(const char *code) {
  char url[128];
  snprintf(url, sizeof(url), "%s%s", BASE_URL, code);

  QRCode qr;
  uint8_t data[qrcode_getBufferSize(4)];
  qrcode_initText(&qr, data, 4, ECC_LOW, url);

  const int avail = 232;
  const int scale = avail / qr.size;
  const int size = qr.size * scale;
  const int ox = (240 - size) / 2;
  const int oy = 28 + (236 - size) / 2;

  tft.fillRect(0, 24, 240, 244, TFT_WHITE);
  for (uint8_t y = 0; y < qr.size; y++) {
    for (uint8_t x = 0; x < qr.size; x++) {
      if (qrcode_getModule(&qr, x, y)) {
        tft.fillRect(ox + x * scale, oy + y * scale, scale, scale, TFT_BLACK);
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

  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_WHITE);
  drawHeader();
  Serial.println("[tft] init done");

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
    if (ok && !timeReady) { tft.fillScreen(TFT_WHITE); drawHeader(); lastSlot = -1; }
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
