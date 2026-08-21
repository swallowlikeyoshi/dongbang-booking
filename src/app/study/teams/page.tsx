import { teamDailyBuckets, memberTotals } from "@/lib/attendance/aggregate";
import { SUB_TEAMS, SUB_TEAM_COLORS } from "@/lib/constants";
import ContributionGrid from "@/components/attendance/ContributionGrid";

export const dynamic = "force-dynamic";

const WEEKS = 18;

export default async function TeamsPage() {
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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">세부팀별 스터디 현황</h1>
      <p className="mt-2 text-sm text-slate-600">최근 {WEEKS}주. 팀마다 자기 색의 농담으로 강도를 표시합니다.</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {SUB_TEAMS.map((t) => (
          <section key={t}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SUB_TEAM_COLORS[t] }} />
              <span>{t}</span>
              <span className="ml-auto text-sm text-slate-500">{teamHours[t].toFixed(0)}h</span>
            </div>
            <ContributionGrid buckets={buckets[t]} weeks={WEEKS} color={SUB_TEAM_COLORS[t]} cell={9} />
          </section>
        ))}
      </div>
    </main>
  );
}
