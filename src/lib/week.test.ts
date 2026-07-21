import { expect, test, describe } from "vitest";
import { weekStart, dayColumns, slotRows } from "./week";

describe("week helpers", () => {
  test("weekStart 는 월요일 00:00", () => {
    // 2026-07-21 화요일 12:00 KST 근처 임의 ts
    const tue = Math.floor(new Date("2026-07-21T12:00:00").getTime() / 1000);
    const ws = weekStart(tue);
    const d = new Date(ws * 1000);
    expect(d.getDay()).toBe(1); // 월요일
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
