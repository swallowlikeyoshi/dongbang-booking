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
