import { expect, test, describe } from "vitest";
import { weekStart, studyWeekStart, dayColumns, slotRows } from "./week";

describe("week helpers", () => {
  test("weekStart 는 일요일 00:00", () => {
    // 2026-07-21 화요일 12:00 KST 근처 임의 ts
    const tue = Math.floor(new Date("2026-07-21T12:00:00").getTime() / 1000);
    const ws = weekStart(tue);
    const d = new Date(ws * 1000);
    expect(d.getDay()).toBe(0); // 일요일
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
  test("dayColumns 는 7일", () => {
    const tue = Math.floor(new Date("2026-07-21T12:00:00").getTime() / 1000);
    expect(dayColumns(weekStart(tue))).toHaveLength(7);
  });
  test("slotRows 는 08:00~23:30 = 32슬롯", () => {
    const rows = slotRows();
    expect(rows[0]).toEqual({ hour: 8, min: 0 });
    expect(rows).toHaveLength(32);
  });
});

describe("studyWeekStart", () => {
  const at = (s: string) => Math.floor(new Date(s).getTime() / 1000);
  const dow = (ts: number) => new Date(ts * 1000).getDay();

  test("월요일 00:00 을 준다", () => {
    const ws = studyWeekStart(at("2026-07-21T12:00:00")); // 화요일
    expect(dow(ws)).toBe(1);
    expect(new Date(ws * 1000).getHours()).toBe(0);
  });

  test("일요일은 그 주의 마지막 날 — 앞선 월요일로 간다", () => {
    // 이게 예약 캘린더용 weekStart 와 갈리는 지점이다.
    const sun = at("2026-07-26T12:00:00");
    expect(dow(sun)).toBe(0);
    const ws = studyWeekStart(sun);
    expect(dow(ws)).toBe(1);
    expect(new Date(ws * 1000).getDate()).toBe(20); // 7/20 월
  });

  test("토요일과 그 다음 일요일은 같은 주에 든다", () => {
    // 주말 작업이 쿼터 두 개로 쪼개지지 않아야 한다.
    const sat = at("2026-07-25T15:00:00");
    const sun = at("2026-07-26T15:00:00");
    expect(studyWeekStart(sat)).toBe(studyWeekStart(sun));
  });

  test("월요일 자정 직후는 그 주에 남는다", () => {
    const mon = at("2026-07-20T00:00:01");
    expect(studyWeekStart(mon)).toBe(at("2026-07-20T00:00:00"));
  });
});
