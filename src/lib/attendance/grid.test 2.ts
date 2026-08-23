import { describe, expect, it } from "vitest";
import { dateKeyFor, levelFor, GRID_LEVELS } from "./grid";

describe("dateKeyFor", () => {
  it("formats as YYYY-MM-DD with zero-padding", () => {
    expect(dateKeyFor(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKeyFor(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("pads single-digit months and days", () => {
    expect(dateKeyFor(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});

describe("levelFor", () => {
  it("returns 0 for non-positive seconds", () => {
    expect(levelFor(0, 100)).toBe(0);
    expect(levelFor(-5, 100)).toBe(0);
  });

  it("never goes below 0.25 for any positive value", () => {
    expect(levelFor(1, 1000)).toBe(0.25);
  });

  it("snaps to the exact GRID_LEVELS step for the ratio", () => {
    expect(levelFor(50, 100)).toBe(0.5);
    expect(levelFor(75, 100)).toBe(0.75);
    expect(levelFor(100, 100)).toBe(1);
  });

  it("only ever returns a value from GRID_LEVELS", () => {
    for (const sec of [1, 10, 25, 26, 49, 50, 51, 74, 75, 99, 100]) {
      expect(GRID_LEVELS).toContain(levelFor(sec, 100));
    }
  });
});
