/**
 * 초를 "N시간 M분" 으로. QR 기록은 분 단위까지 정확하므로 시간 소수점보다
 * 시·분이 읽기 쉽고 오해도 적다.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
