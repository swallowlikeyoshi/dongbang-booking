import { dateKeyFor, levelFor } from "@/lib/attendance/grid";

type Props = {
  /** 날짜(YYYY-MM-DD) → 초 */
  buckets: Record<string, number>;
  /** 표시할 주 수 */
  weeks: number;
  /** 최댓값 색상. 농도는 이 색과 배경의 혼합으로 만든다. */
  color: string;
  cell?: number;
};

export default function ContributionGrid({ buckets, weeks, color, cell = 12 }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // end = 이번 주 토요일. weeks * 7 일 전부터 이 날까지 역순으로 채운다.
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const days: { k: string; sec: number }[] = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = dateKeyFor(d);
    days.push({ k, sec: buckets[k] ?? 0 });
  }

  const max = Math.max(1, ...days.map((d) => d.sec));

  function bg(sec: number): string {
    if (sec <= 0) return "transparent";
    const level = levelFor(sec, max);
    return `color-mix(in oklab, ${color} ${Math.round(level * 100)}%, white)`;
  }

  const cols: { k: string; sec: number }[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(days.slice(w * 7, w * 7 + 7));

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((d) => (
            <div
              key={d.k}
              title={`${d.k} · ${(d.sec / 3600).toFixed(1)}시간`}
              style={{
                width: cell,
                height: cell,
                borderRadius: 3,
                // 빈 칸은 얇은 테두리만으로는 거의 보이지 않아 격자가 사라진다.
                // GitHub 처럼 옅은 면으로 채워 칸의 존재 자체가 읽히게 한다.
                background: d.sec > 0 ? bg(d.sec) : "#e9edf2",
                boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.06)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
