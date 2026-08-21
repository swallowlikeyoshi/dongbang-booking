import { expect, test, describe } from "vitest";
import { slotNumber, codeForSlot, verifyCode, SLOT_SECONDS } from "./code";

const devices = [
  { roomId: 1, secret: "secret-room-1" },
  { roomId: 2, secret: "secret-room-2" },
];

describe("code", () => {
  test("슬롯은 60초 단위", () => {
    expect(slotNumber(0)).toBe(0);
    expect(slotNumber(59)).toBe(0);
    expect(slotNumber(60)).toBe(1);
    expect(SLOT_SECONDS).toBe(60);
  });

  test("코드는 6자, 허용 알파벳만 사용", () => {
    const c = codeForSlot("secret-room-1", 12345);
    expect(c).toHaveLength(6);
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  test("같은 시크릿·슬롯이면 같은 코드", () => {
    expect(codeForSlot("s", 7)).toBe(codeForSlot("s", 7));
  });

  test("시크릿이 다르면 코드가 다르다", () => {
    expect(codeForSlot("secret-room-1", 7)).not.toBe(codeForSlot("secret-room-2", 7));
  });

  test("현재 슬롯 코드를 검증하면 방이 나온다", () => {
    const ts = 1_700_000_000;
    const code = codeForSlot("secret-room-2", slotNumber(ts));
    expect(verifyCode(code, ts, devices)).toEqual({ roomId: 2, slot: slotNumber(ts) });
  });

  test("직전 슬롯 코드도 인정한다", () => {
    const ts = 1_700_000_000;
    const prev = codeForSlot("secret-room-1", slotNumber(ts) - 1);
    expect(verifyCode(prev, ts, devices)).toEqual({ roomId: 1, slot: slotNumber(ts) - 1 });
  });

  test("두 슬롯 이전 코드는 거절", () => {
    const ts = 1_700_000_000;
    const old = codeForSlot("secret-room-1", slotNumber(ts) - 2);
    expect(verifyCode(old, ts, devices)).toBeNull();
  });

  test("소문자 입력도 허용", () => {
    const ts = 1_700_000_000;
    const code = codeForSlot("secret-room-1", slotNumber(ts));
    expect(verifyCode(code.toLowerCase(), ts, devices)?.roomId).toBe(1);
  });

  test("엉터리 코드는 null", () => {
    expect(verifyCode("ZZZZZZ", 1_700_000_000, devices)).toBeNull();
    expect(verifyCode("", 1_700_000_000, devices)).toBeNull();
  });
});
