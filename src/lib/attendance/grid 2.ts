/** ContributionGrid 가 쓰는 순수 로직. 잔디 그래프 날짜 버킷팅과 색 농도 계산. */

export const GRID_LEVELS = [0, 0.25, 0.5, 0.75, 1];

/** 로컬 타임존 기준 YYYY-MM-DD 키. UTC 변환 없이 Date 필드를 그대로 읽는다. */
export function dateKeyFor(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * sec/max 비율을 GRID_LEVELS 중 하나로 스냅한다. sec<=0 이면 0(빈 칸)을 반환하고,
 * 그 외에는 0.25 미만으로 내려가지 않는다(가장 옅은 단계도 눈에 보이게).
 */
export function levelFor(sec: number, max: number): number {
  if (sec <= 0) return 0;
  const ratio = sec / max;
  const level = GRID_LEVELS.reduce((acc, l) => (ratio >= l ? l : acc), 0.25);
  return Math.max(level, 0.25);
}
