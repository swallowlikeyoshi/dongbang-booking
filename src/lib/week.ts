export function weekStart(now: number): number {
  const d = new Date(now * 1000);
  const day = d.getDay(); // 0=일
  d.setDate(d.getDate() - day); // 일요일까지 이동
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function dayColumns(weekStartTs: number): number[] {
  const cols: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartTs * 1000);
    d.setDate(d.getDate() + i);
    cols.push(Math.floor(d.getTime() / 1000));
  }
  return cols;
}

export function slotRows(): { hour: number; min: number }[] {
  const rows: { hour: number; min: number }[] = [];
  for (let h = 8; h < 24; h++) {
    rows.push({ hour: h, min: 0 });
    rows.push({ hour: h, min: 30 });
  }
  return rows;
}

/**
 * 스터디 주(週)의 시작 — **월요일** 00:00.
 *
 * 예약 캘린더가 쓰는 `weekStart`(일요일 시작)와 일부러 다르다. 팀 주간 쿼터는
 * 토·일 작업이 한 주로 묶여야 자연스러운데, 일요일 시작이면 주말이 두 주로
 * 쪼개져 같은 주말 작업이 서로 다른 쿼터에서 깎인다. 예약 시트의 요일 배치는
 * 이 문제와 무관하므로 그대로 둔다.
 */
export function studyWeekStart(now: number): number {
  const d = new Date(now * 1000);
  const day = d.getDay(); // 0=일
  const backToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - backToMonday);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
