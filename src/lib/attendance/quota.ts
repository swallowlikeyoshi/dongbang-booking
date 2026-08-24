/**
 * 팀 주간 쿼터 계산.
 *
 * 전기팀은 세부팀마다 주당 정해진 시간(기본 10시간)만 스터디 시간으로 인정한다.
 * 이때 소모되는 것은 팀원들의 시간 **합계가 아니라 팀이 방을 점유한 시간**이다 —
 * 여섯 명이 같은 방에 여섯 시간 앉아 있었으면 팀은 36시간이 아니라 6시간을 쓴 것이다.
 * 그래서 구간의 합집합(union)으로 센다.
 *
 * 개인 인정 시간은 여전히 각자의 시간이다. 쿼터는 팀이 얼마나 더 할 수 있는지를
 * 제한할 뿐이고, 쿼터가 바닥난 뒤의 시간만 인정에서 빠진다(= "일부만 인정").
 *
 * 순수 함수만 둔다. DB 도 시간대도 모른다 — 전부 epoch 초로 받는다.
 */

export type Interval = { start: number; end: number };

/**
 * 겹치거나 맞닿은 구간을 합쳐 정렬된 서로소 구간으로 만든다.
 *
 * 맞닿은 경우(앞 구간의 끝 == 뒤 구간의 시작)도 합친다. 13시에 나가고 13시에
 * 들어왔다면 팀은 그 사이에도 방을 점유하고 있었다고 보는 것이 자연스럽다.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** 합집합의 총 길이(초). 팀이 실제로 점유한 시간. */
export function unionSeconds(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((acc, i) => acc + (i.end - i.start), 0);
}

/**
 * 쿼터가 소진되는 시각. 합집합을 시간순으로 훑어 누적이 `quotaSeconds` 를
 * **넘어서는** 순간을 돌려준다. 끝까지 훑어도 넘지 않으면 null.
 *
 * 정확히 맞아떨어지는 경우(누적 == 쿼터)는 null 이다 — 딱 10시간을 채운 팀에게
 * "초과했다"고 말할 이유가 없다.
 */
export function quotaCutoff(intervals: Interval[], quotaSeconds: number): number | null {
  const merged = mergeIntervals(intervals);
  if (merged.length === 0) return null;
  if (quotaSeconds <= 0) return merged[0].start;

  let acc = 0;
  for (const i of merged) {
    const len = i.end - i.start;
    if (acc + len > quotaSeconds) return i.start + (quotaSeconds - acc);
    acc += len;
  }
  return null;
}

/**
 * 쿼터 안에 드는 구간들. 쿼터를 넘지 않으면 합집합 그대로다.
 * 이 구간과 겹치는 시간만 개인 인정 시간에 들어간다.
 */
export function countedRegion(intervals: Interval[], quotaSeconds: number): Interval[] {
  const merged = mergeIntervals(intervals);
  const cutoff = quotaCutoff(merged, quotaSeconds);
  if (cutoff === null) return merged;

  const out: Interval[] = [];
  for (const i of merged) {
    if (i.end <= cutoff) {
      out.push({ ...i });
      continue;
    }
    if (i.start < cutoff) out.push({ start: i.start, end: cutoff });
    break;
  }
  return out;
}

/** 한 세션이 인정 구간과 겹치는 초. 전부 벗어나면 0. */
export function overlapSeconds(session: Interval, region: Interval[]): number {
  let acc = 0;
  for (const r of region) {
    const lo = Math.max(session.start, r.start);
    const hi = Math.min(session.end, r.end);
    if (hi > lo) acc += hi - lo;
  }
  return acc;
}
