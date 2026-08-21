import { teamDailyBuckets, memberTotals } from "@/lib/attendance/aggregate";
import { SUB_TEAMS, SUB_TEAM_COLORS } from "@/lib/constants";
import ContributionGrid from "@/components/attendance/ContributionGrid";

const WEEKS = 18;

export default function TeamsSection() {
  const now = Math.floor(Date.now() / 1000);
  const buckets = teamDailyBuckets(now - WEEKS * 7 * 86400, now);
  const totals = memberTotals();

  const teamHours: Record<string, number> = {};
  for (const t of SUB_TEAMS) teamHours[t] = 0;
  for (const r of totals) {
    if (teamHours[r.member.sub_team] !== undefined) {
      teamHours[r.member.sub_team] += r.countedSeconds / 3600;
    }
  }

  return (
    <section id="teams" className="scroll-mt-16">
      <h2 className="text-lg font-medium">팀 현황</h2>
      <p className="mt-1 text-sm text-slate-500">
        최근 {WEEKS}주. 팀마다 자기 색의 농담으로 강도를 표시합니다 — 팀끼리는 색이 아니라 패턴 모양으로 비교하세요.
      </p>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        {SUB_TEAMS.map((t) => (
          <div key={t}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SUB_TEAM_COLORS[t] }} />
              <span>{t}</span>
              <span className="ml-auto text-sm text-slate-500">{teamHours[t].toFixed(0)}h</span>
            </div>
            <ContributionGrid buckets={buckets[t]} weeks={WEEKS} color={SUB_TEAM_COLORS[t]} cell={9} />
          </div>
        ))}
      </div>
    </section>
  );
}
