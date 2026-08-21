import { memberTotals } from "@/lib/attendance/aggregate";
import { getEntryQuota, getWeeklyCapSeconds } from "@/lib/attendance/settings";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import type { Member } from "@/lib/db/members";

export default function RankingSection({ me }: { me: Member | null }) {
  const cap = getWeeklyCapSeconds();
  const quota = getEntryQuota();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);
  const myRank = me ? rows.findIndex((r) => r.member.id === me.id) + 1 : 0;

  return (
    <section id="ranking" className="scroll-mt-16">
      <h2 className="text-lg font-medium">순위</h2>
      <p className="mt-1 text-sm text-slate-500">
        영광 대회 엔트리 순서 기준입니다.
        {cap ? ` 주간 인정 상한 ${(cap / 3600).toFixed(0)}시간이 적용되어 있습니다.` : ""}
        {myRank > 0 && ` 내 순위 ${myRank}위 / ${rows.length}명.`}
      </p>

      {/* 58명이면 페이지가 지나치게 길어져 아래 섹션이 밀린다. 표 자체를 스크롤시킨다. */}
      <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
            <tr>
              <th className="w-12 px-3 py-2">#</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">세부팀</th>
              <th className="px-3 py-2 text-right">인정 시간</th>
              {cap && <th className="px-3 py-2 text-right">상한 전</th>}
              <th className="px-3 py-2 text-right">보정</th>
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
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                      style={{ background: SUB_TEAM_COLORS[r.member.sub_team as SubTeam] ?? "#94a3b8" }}
                    />
                    {r.member.name}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.member.sub_team}</td>
                  <td className="px-3 py-2 text-right">{(r.countedSeconds / 3600).toFixed(1)}h</td>
                  {cap && (
                    <td className="px-3 py-2 text-right text-slate-400">
                      {r.rawSeconds !== r.countedSeconds ? `${(r.rawSeconds / 3600).toFixed(1)}h` : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right text-slate-500">
                    {r.adjustedCount > 0 ? `${r.adjustedCount}/${r.sessionCount}` : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">아직 기록된 시간이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {quota !== null && (
        <p className="mt-2 text-sm text-slate-500">빨간 선이 엔트리 정원 {quota}명 컷입니다.</p>
      )}
    </section>
  );
}
