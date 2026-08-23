import { memberTotals } from "@/lib/attendance/aggregate";
import { getEntryQuota, getWeeklyCapSeconds } from "@/lib/attendance/settings";
import {
  SUB_TEAM_COLORS,
  COMPETITION_ROW_TINT,
  COMPETITIONS,
  type SubTeam,
  type Competition,
} from "@/lib/constants";
import type { Member } from "@/lib/db/members";
import { formatDuration } from "@/lib/attendance/format";
import CompetitionSelect from "./CompetitionSelect";

export default function RankingSection({
  me,
  isAdmin,
  /** 공개 페이지에서는 페이지 제목이 따로 있어 섹션 제목을 숨긴다. */
  bare = false,
}: {
  me: Member | null;
  isAdmin: boolean;
  bare?: boolean;
}) {
  const cap = getWeeklyCapSeconds();
  const quota = getEntryQuota();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);
  const myRank = me ? rows.findIndex((r) => r.member.id === me.id) + 1 : 0;

  return (
    <section
      id="ranking"
      className={
        bare
          ? ""
          : "scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      {!bare && <h2 className="border-b border-slate-100 pb-3 text-lg font-medium">순위</h2>}
      <p className="mt-1 text-sm text-slate-500">
        영광 대회 엔트리 순서 기준입니다.
        {cap ? ` 주간 인정 상한 ${(cap / 3600).toFixed(0)}시간이 적용되어 있습니다.` : ""}
        {myRank > 0 && ` 내 순위 ${myRank}위 / ${rows.length}명.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {COMPETITIONS.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-5 rounded-sm border border-slate-200 ${COMPETITION_ROW_TINT[c]}`}
            />
            {c}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-slate-200 bg-white" />
          미배정
        </span>
      </div>

      {/* 58명이면 페이지가 지나치게 길어져 아래 섹션이 밀린다. 표 자체를 스크롤시킨다. */}
      <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-lg border">
        <table className="w-full table-auto text-sm">
          <thead className="sticky top-0 bg-white text-left text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
            <tr>
              <th className="w-8 px-2 py-2 sm:w-12 sm:px-3">#</th>
              <th className="px-2 py-2 sm:px-3">이름</th>
              <th className="hidden px-3 py-2 sm:table-cell">세부팀</th>
              <th className="px-2 py-2 sm:px-3">대회</th>
              <th className="px-2 py-2 text-right sm:px-3">인정 시간</th>
              {cap && <th className="hidden px-3 py-2 text-right sm:table-cell">상한 전</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isMe = me?.id === r.member.id;
              const cut = quota !== null && i + 1 === quota;
              const tint = r.member.competition
                ? COMPETITION_ROW_TINT[r.member.competition as Competition] ?? ""
                : "";
              return (
                <tr
                  key={r.member.id}
                  className={`border-t ${isMe ? "bg-sky-50 font-medium" : tint} ${cut ? "border-b-2 border-b-red-400" : ""}`}
                >
                  <td className="px-2 py-2 sm:px-3">{i + 1}</td>
                  <td className="px-2 py-2 sm:px-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: SUB_TEAM_COLORS[r.member.sub_team as SubTeam] ?? "#94a3b8" }}
                      />
                      <span className="whitespace-nowrap">{r.member.name}</span>
                    </span>
                    {/* 좁은 화면에서는 세부팀 열을 숨기고 이름 아래로 접는다.
                        열로 두면 한 글자씩 세로로 흐른다. */}
                    <span className="mt-0.5 block pl-[18px] text-xs text-slate-500 sm:hidden">
                      {r.member.sub_team}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">
                    <span className="whitespace-nowrap">{r.member.sub_team}</span>
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    {isAdmin ? (
                      <CompetitionSelect memberId={r.member.id} value={r.member.competition} />
                    ) : (
                      <span className="text-slate-600">{r.member.competition ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap sm:px-3">{formatDuration(r.countedSeconds)}</td>
                  {cap && (
                    <td className="hidden px-3 py-2 text-right text-slate-400 sm:table-cell">
                      {r.rawSeconds !== r.countedSeconds ? formatDuration(r.rawSeconds) : "—"}
                    </td>
                  )}
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
