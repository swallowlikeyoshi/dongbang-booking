import { expect, test, describe } from "vitest";
import { snapToSlot, overlaps, validateReservation } from "./reservations";
import { SLOT_SECONDS } from "./constants";

describe("snapToSlot", () => {
  test("정각은 그대로", () => {
    const t = 1800 * 100;
    expect(snapToSlot(t)).toBe(t);
  });
  test("30분 격자 아래로 내림", () => {
    expect(snapToSlot(1800 * 100 + 600)).toBe(1800 * 100);
  });
  test("SLOT_SECONDS는 1800", () => {
    expect(SLOT_SECONDS).toBe(1800);
  });
});

describe("overlaps", () => {
  const base = { start_at: 1000, end_at: 2000 };
  test("겹치면 true", () => {
    expect(overlaps(base, { start_at: 1500, end_at: 2500 })).toBe(true);
  });
  test("맞닿기만 하면 false (end==start 허용)", () => {
    expect(overlaps(base, { start_at: 2000, end_at: 3000 })).toBe(false);
  });
  test("완전히 떨어지면 false", () => {
    expect(overlaps(base, { start_at: 3000, end_at: 4000 })).toBe(false);
  });
});

describe("validateReservation", () => {
  const valid = { room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600 };
  test("정상 입력은 ok", () => {
    expect(validateReservation(valid, [])).toEqual({ ok: true });
  });
  test("잘못된 팀은 거절", () => {
    const r = validateReservation({ ...valid, team: "축구팀" }, []);
    expect(r.ok).toBe(false);
  });
  test("start >= end 거절", () => {
    const r = validateReservation({ ...valid, start_at: 3600, end_at: 3600 }, []);
    expect(r.ok).toBe(false);
  });
  test("격자에 안 맞으면 거절", () => {
    const r = validateReservation({ ...valid, start_at: 1900 }, []);
    expect(r.ok).toBe(false);
  });
  test("같은 방 시간 겹치면 거절", () => {
    const existing = [{ room_id: 1, start_at: 1800, end_at: 5400 }];
    const r = validateReservation(valid, existing);
    expect(r.ok).toBe(false);
  });
  test("다른 방이면 겹쳐도 ok", () => {
    const existing = [{ room_id: 2, start_at: 1800, end_at: 5400 }];
    expect(validateReservation(valid, existing)).toEqual({ ok: true });
  });
  test("room_id 가 NaN이면 거절", () => {
    const r = validateReservation({ ...valid, room_id: NaN }, []);
    expect(r.ok).toBe(false);
  });
});
