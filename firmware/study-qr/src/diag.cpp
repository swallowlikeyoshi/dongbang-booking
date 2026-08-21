// ILI9225 배선 진단. 노션 "6/24 스터디 — ESP32 TFT LCD + CAN 버스 통합"(곽효건)에
// 따르면 11핀 + TnG1822E/CMA30S/74HC245D 구성 모듈은 ILI9341 이 아니라 ILI9225 다.
#include <Arduino.h>
#include <TFT_22_ILI9225.h>
#include "config.h"

// 4인자 하드웨어 SPI 생성자. 5인자 생성자는 마지막 인자가 LED 핀으로 잘못 해석된다.
TFT_22_ILI9225 tft = TFT_22_ILI9225(PIN_TFT_RST, PIN_TFT_DC, PIN_TFT_CS, (uint8_t)0);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[diag] ILI9225 (TFT_22_ILI9225)");
  Serial.printf("[diag] RST=%d RS=%d CS=%d  (MOSI/CLK 은 VSPI 기본 23/18)\n",
                PIN_TFT_RST, PIN_TFT_DC, PIN_TFT_CS);
  tft.begin();
  Serial.printf("[diag] begin 완료 — %dx%d\n", tft.maxX(), tft.maxY());
}

void loop() {
  struct { uint16_t c; const char *n; } steps[] = {
    {COLOR_RED, "RED"}, {COLOR_GREEN, "GREEN"}, {COLOR_BLUE, "BLUE"},
  };
  for (auto &s : steps) {
    Serial.printf("[diag] %s\n", s.n);
    tft.fillRectangle(0, 0, tft.maxX() - 1, tft.maxY() - 1, s.c);
    delay(1500);
  }
  Serial.println("[diag] WHITE + 글자");
  tft.fillRectangle(0, 0, tft.maxX() - 1, tft.maxY() - 1, COLOR_WHITE);
  tft.setFont(Terminal6x8);
  tft.drawText(10, 10, "HEVEN STUDY QR", COLOR_BLACK);
  tft.drawText(10, 30, "ILI9225 OK", COLOR_RED);
  delay(2500);
}
