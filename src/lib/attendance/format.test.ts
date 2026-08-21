import { expect, test, describe } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  test("시간과 분을 모두 보여준다", () => {
    expect(formatDuration(3600 + 30 * 60)).toBe("1시간 30분");
  });
  test("정각이면 분을 생략", () => {
    expect(formatDuration(2 * 3600)).toBe("2시간");
  });
  test("1시간 미만이면 분만", () => {
    expect(formatDuration(45 * 60)).toBe("45분");
    expect(formatDuration(0)).toBe("0분");
  });
  test("초 단위는 분으로 반올림", () => {
    expect(formatDuration(3600 + 29)).toBe("1시간");
    expect(formatDuration(3600 + 31)).toBe("1시간 1분");
  });
  test("음수는 0분", () => {
    expect(formatDuration(-100)).toBe("0분");
  });
});
