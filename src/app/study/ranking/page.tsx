import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { memberTotals } from "@/lib/attendance/aggregate";
import { getEntryQuota, getWeeklyCapSeconds } from "@/lib/attendance/settings";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/study/ranking");
  const me = getMemberByEmail(user.email);

  const cap = getWeeklyCapSeconds();
  const quota = getEntryQuota();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">스터디 시간 순위</h1>
      <p className="mt-2 text-sm text-slate-600">
        영광 대회 엔트리 순서 기준입니다.
        {cap ? ` 주간 인정 상한 ${(cap / 3600).toFixed(0)}시간이 적용되어 있습니다.` : ""}
      </p>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2 w-12">#</th>
            <th className="py-2">이름</th>
            <th className="py-2">세부팀</th>
            <th className="py-2 text-right">인정 시간</th>
            {cap && <th className="py-2 text-right">상한 전</th>}
            <th className="py-2 text-right">보정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = me?.id === r.member.id;
            const cut = quota !== null && i + 1 === quota;
            return (
              <tr
                key={r.member.id}
                className={`border-t ${isMe ? "bg-sky-50 font-medium" : ""} ${cut ? "border-b-2 border-b-red-400" : ""}`}
              >
                <td className="py-2">{i + 1}</td>
                <td className="py-2">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                    style={{ background: SUB_TEAM_COLORS[r.member.sub_team as SubTeam] ?? "#94a3b8" }}
                  />
                  {r.member.name}
                </td>
                <td className="py-2 text-slate-600">{r.member.sub_team}</td>
                <td className="py-2 text-right">{(r.countedSeconds / 3600).toFixed(1)}h</td>
                {cap && (
                  <td className="py-2 text-right text-slate-400">
                    {r.rawSeconds !== r.countedSeconds ? `${(r.rawSeconds / 3600).toFixed(1)}h` : "—"}
                  </td>
                )}
                <td className="py-2 text-right text-slate-500">
                  {r.adjustedCount > 0 ? `${r.adjustedCount}/${r.sessionCount}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {quota !== null && (
        <p className="mt-4 text-sm text-slate-500">빨간 선이 엔트리 정원 {quota}명 컷입니다.</p>
      )}
    </main>
  );
}
