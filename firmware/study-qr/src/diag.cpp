// 배선 진단 전용 — 클러스터와 동일한 Adafruit_ILI9341 경로로 검증한다.
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

// 클러스터 펌웨어에서 실물 검증된 핀 배정
constexpr int PIN_CS   = 26;
constexpr int PIN_DC   = 25;
constexpr int PIN_RST  = 33;
constexpr int PIN_SCLK = 18;
constexpr int PIN_MOSI = 23;
constexpr int PIN_MISO = -1;

Adafruit_ILI9341 tft(PIN_CS, PIN_DC, PIN_RST);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[diag] Adafruit_ILI9341 경로 (클러스터와 동일)");
  Serial.printf("[diag] CS=%d DC=%d RST=%d SCLK=%d MOSI=%d\n",
                PIN_CS, PIN_DC, PIN_RST, PIN_SCLK, PIN_MOSI);

  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, PIN_CS);
  tft.begin();
  tft.setRotation(1);
  Serial.println("[diag] tft.begin() 완료 — 2초마다 색 전환");
}

void loop() {
  struct { uint16_t c; const char *n; } steps[] = {
    {ILI9341_RED, "RED"}, {ILI9341_GREEN, "GREEN"},
    {ILI9341_BLUE, "BLUE"}, {ILI9341_WHITE, "WHITE+검은사각+글자"},
  };
  for (auto &s : steps) {
    Serial.printf("[diag] %s\n", s.n);
    tft.fillScreen(s.c);
    if (s.c == ILI9341_WHITE) {
      tft.fillRect(60, 60, 120, 120, ILI9341_BLACK);
      tft.setTextColor(ILI9341_BLACK);
      tft.setTextSize(3);
      tft.setCursor(10, 10);
      tft.print("HELLO");
    }
    delay(2000);
  }
}
