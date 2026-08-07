import { expect, test, describe } from "vitest";
import { snapToSlot, overlaps, validateReservation, expandWeekly, normalizeRepeatWeeks } from "./reservations";
import { SLOT_SECONDS, MAX_REPEAT_WEEKS, WEEK_SECONDS } from "./constants";

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

describe("normalizeRepeatWeeks", () => {
  test("빈 값은 1회(반복 없음)", () => {
    expect(normalizeRepeatWeeks(undefined)).toBe(1);
    expect(normalizeRepeatWeeks(null)).toBe(1);
    expect(normalizeRepeatWeeks(NaN)).toBe(1);
  });
  test("1 미만은 1로", () => {
    expect(normalizeRepeatWeeks(0)).toBe(1);
    expect(normalizeRepeatWeeks(-5)).toBe(1);
  });
  test("상한을 넘으면 잘림", () => {
    expect(normalizeRepeatWeeks(999)).toBe(MAX_REPEAT_WEEKS);
  });
  test("소수는 내림", () => {
    expect(normalizeRepeatWeeks(3.9)).toBe(3);
  });
});

describe("expandWeekly", () => {
  const base = { room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600 };

  test("1회면 원본 그대로", () => {
    expect(expandWeekly(base, 1)).toEqual([base]);
  });

  test("N회면 정확히 7일 간격으로 N개", () => {
    const out = expandWeekly(base, 3);
    expect(out).toHaveLength(3);
    expect(out.map((o) => o.start_at)).toEqual([
      1800,
      1800 + WEEK_SECONDS,
      1800 + 2 * WEEK_SECONDS,
    ]);
    expect(out.map((o) => o.end_at)).toEqual([
      3600,
      3600 + WEEK_SECONDS,
      3600 + 2 * WEEK_SECONDS,
    ]);
  });

  test("팀·설명·방은 모든 회차에 동일하게 복사", () => {
    const out = expandWeekly({ ...base, title: "정기 회의" }, 4);
    for (const o of out) {
      expect(o.room_id).toBe(1);
      expect(o.team).toBe("전기팀");
      expect(o.title).toBe("정기 회의");
    }
  });

  test("길이(duration)는 회차마다 보존", () => {
    for (const o of expandWeekly(base, 5)) {
      expect(o.end_at - o.start_at).toBe(1800);
    }
  });
});
