import { describe, expect, it } from "vitest";
import {
  countedRegion,
  mergeIntervals,
  overlapSeconds,
  quotaCutoff,
  unionSeconds,
  type Interval,
} from "./quota";

const H = (h: number) => h * 3600;
const iv = (a: number, b: number): Interval => ({ start: H(a), end: H(b) });

describe("mergeIntervals", () => {
  it("빈 입력은 빈 결과", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("겹치는 구간을 합친다", () => {
    // 사용자가 든 예: A 11~16, B 12~17 → 11~17
    expect(mergeIntervals([iv(11, 16), iv(12, 17)])).toEqual([iv(11, 17)]);
  });

  it("떨어진 구간은 그대로 둔다", () => {
    expect(mergeIntervals([iv(9, 10), iv(14, 15)])).toEqual([iv(9, 10), iv(14, 15)]);
  });

  it("맞닿은 구간은 하나로 본다", () => {
    // 13시에 나가고 13시에 들어오면 팀은 계속 방을 점유한 것이다
    expect(mergeIntervals([iv(9, 13), iv(13, 15)])).toEqual([iv(9, 15)]);
  });

  it("완전히 포함된 구간을 삼킨다", () => {
    expect(mergeIntervals([iv(9, 18), iv(12, 13)])).toEqual([iv(9, 18)]);
  });

  it("입력 순서와 무관하다", () => {
    expect(mergeIntervals([iv(14, 15), iv(9, 10), iv(9, 12)]))
      .toEqual([iv(9, 12), iv(14, 15)]);
  });

  it("입력 배열을 건드리지 않는다", () => {
    const input = [iv(14, 15), iv(9, 10)];
    const copy = JSON.parse(JSON.stringify(input));
    mergeIntervals(input);
    expect(input).toEqual(copy);
  });
});

describe("unionSeconds", () => {
  it("사용자 예시: 11~16 과 12~17 은 6시간", () => {
    expect(unionSeconds([iv(11, 16), iv(12, 17)])).toBe(H(6));
  });

  it("여섯 명이 같은 시간에 앉아 있어도 한 번만 센다", () => {
    // 8/22 토크벡터링: 6명이 ~6시간. 단순 합산이면 36시간이 된다.
    const six = Array.from({ length: 6 }, () => iv(13, 19));
    expect(unionSeconds(six)).toBe(H(6));
  });

  it("떨어진 구간은 각각 더한다", () => {
    expect(unionSeconds([iv(9, 11), iv(14, 15)])).toBe(H(3));
  });

  it("빈 입력은 0", () => {
    expect(unionSeconds([])).toBe(0);
  });
});

describe("quotaCutoff", () => {
  it("쿼터에 못 미치면 null — 아무도 깎이지 않는다", () => {
    expect(quotaCutoff([iv(13, 19)], H(10))).toBeNull();
  });

  it("정확히 맞아떨어져도 null — 상한을 넘겨야 자른다", () => {
    expect(quotaCutoff([iv(9, 19)], H(10))).toBeNull();
  });

  it("구간 중간에서 소진되면 그 시각을 준다", () => {
    // 9시부터 22시까지 = 13시간. 10시간째는 19시.
    expect(quotaCutoff([iv(9, 22)], H(10))).toBe(H(19));
  });

  it("여러 구간에 걸쳐 누적한다", () => {
    // 9~12(3h) + 14~22(8h). 10시간째는 두 번째 구간의 7시간 지점 = 21시.
    expect(quotaCutoff([iv(9, 12), iv(14, 22)], H(10))).toBe(H(21));
  });

  it("빈 틈은 쿼터를 소모하지 않는다", () => {
    // 9~10(1h) + 20~21(1h) = 2시간뿐이므로 3시간 쿼터에 못 미친다
    expect(quotaCutoff([iv(9, 10), iv(20, 21)], H(3))).toBeNull();
  });

  it("쿼터가 0이면 시작 즉시 소진", () => {
    expect(quotaCutoff([iv(9, 19)], 0)).toBe(H(9));
  });
});

describe("countedRegion", () => {
  it("쿼터에 못 미치면 전 구간이 인정된다", () => {
    expect(countedRegion([iv(13, 19)], H(10))).toEqual([iv(13, 19)]);
  });

  it("소진 시점에서 잘린다", () => {
    expect(countedRegion([iv(9, 22)], H(10))).toEqual([iv(9, 19)]);
  });

  it("앞선 구간은 온전히 남고 마지막만 잘린다", () => {
    expect(countedRegion([iv(9, 12), iv(14, 22)], H(10)))
      .toEqual([iv(9, 12), iv(14, 21)]);
  });
});

describe("overlapSeconds", () => {
  const region = [iv(9, 12), iv(14, 21)];

  it("완전히 안에 들면 제 시간 전부", () => {
    expect(overlapSeconds(iv(10, 11), region)).toBe(H(1));
  });

  it("완전히 벗어나면 0 — 쿼터 소진 후 시작한 세션", () => {
    expect(overlapSeconds(iv(22, 23), region)).toBe(0);
  });

  it("걸쳐 있으면 겹치는 만큼만 — '일부만 인정'", () => {
    // 20시에 시작해 23시에 끝났지만 쿼터는 21시에 소진됐다
    expect(overlapSeconds(iv(20, 23), region)).toBe(H(1));
  });

  it("빈 구간 사이에 놓이면 0", () => {
    expect(overlapSeconds(iv(12, 14), region)).toBe(0);
  });

  it("여러 구간에 걸치면 각각 더한다", () => {
    expect(overlapSeconds(iv(11, 15), region)).toBe(H(2));
  });
});
