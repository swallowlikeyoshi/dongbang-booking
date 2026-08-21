import { allDailyBuckets, memberTotals } from "@/lib/attendance/aggregate";
import { formatDuration } from "@/lib/attendance/format";
import ContributionGrid from "@/components/attendance/ContributionGrid";

const WEEKS = 26;

export default function TeamTotalSection() {
  const now = Math.floor(Date.now() / 1000);
  const buckets = allDailyBuckets(now - WEEKS * 7 * 86400, now);
  const rows = memberTotals();

  const totalSeconds = rows.reduce((acc, r) => acc + r.countedSeconds, 0);
  const activeDays = Object.keys(buckets).length;
  const activeMembers = rows.filter((r) => r.countedSeconds > 0).length;
  const busiest = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];

  return (
    <section id="all" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="border-b border-slate-100 pb-3 text-lg font-medium">전기팀 전체</h2>
      <p className="mt-3 text-sm text-slate-500">최근 {WEEKS}주 동안 전기팀이 쌓은 시간입니다.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">누적</div>
          <div className="text-xl">{formatDuration(totalSeconds)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">활동한 날</div>
          <div className="text-xl">{activeDays}일</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">참여 인원</div>
          <div className="text-xl">{activeMembers}명</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">가장 많았던 날</div>
          <div className="text-xl">{busiest ? formatDuration(busiest[1]) : "—"}</div>
          {busiest && <div className="mt-1 text-xs text-slate-400">{busiest[0]}</div>}
        </div>
      </div>

      <div className="mt-5">
        <ContributionGrid buckets={buckets} weeks={WEEKS} color="#2a78d6" cell={16} showWeekdays />
      </div>
    </section>
  );
}
