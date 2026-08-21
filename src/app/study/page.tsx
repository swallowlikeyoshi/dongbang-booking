import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { listSessionsByMember, listEdits } from "@/lib/attendance/sessions";
import { dailyBuckets, memberTotals, weekSecondsFor } from "@/lib/attendance/aggregate";
import { getWeeklyCapSeconds } from "@/lib/attendance/settings";
import { weekStart } from "@/lib/week";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import ContributionGrid from "@/components/attendance/ContributionGrid";
import UnresolvedReport from "@/components/attendance/UnresolvedReport";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "진행 중",
  confirmed: "QR 종료",
  pending: "보정 승인 대기",
  approved: "보정 승인됨",
  rejected: "거부됨",
  unresolved: "미확정 · 신고 필요",
};

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function StudyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/study");
  const member = getMemberByEmail(user.email);
  if (!member) redirect("/onboarding");

  const now = Math.floor(Date.now() / 1000);
  const sessions = listSessionsByMember(member.id);
  const cap = getWeeklyCapSeconds();
  const totals = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined).find((t) => t.member.id === member.id);
  const isCapped = cap && totals && totals.rawSeconds !== totals.countedSeconds;
  const buckets = dailyBuckets(member.id, now - 26 * 7 * 86400, now);
  const thisWeek = weekStart(now);
  const weekSeconds = weekSecondsFor(sessions, thisWeek);

  const color = SUB_TEAM_COLORS[member.sub_team as SubTeam] ?? "#2a78d6";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">{member.name} · {member.sub_team}</h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">누적</div>
          <div className="text-2xl">{((totals?.countedSeconds ?? 0) / 3600).toFixed(1)}시간</div>
          {isCapped && totals && (
            <div className="mt-1 text-xs text-slate-400">
              상한 전 {(totals.rawSeconds / 3600).toFixed(1)}시간 · 주간 인정 상한 {(cap! / 3600).toFixed(0)}시간이 적용되었습니다.
            </div>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">이번 주</div>
          <div className="text-2xl">{(weekSeconds / 3600).toFixed(1)}시간</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">보정 건수</div>
          <div className="text-2xl">{totals?.adjustedCount ?? 0}건</div>
        </div>
      </div>

      <h2 className="mt-8 mb-2 text-sm text-slate-500">최근 26주</h2>
      <ContributionGrid buckets={buckets} weeks={26} color={color} />

      <h2 className="mt-8 mb-2 text-sm text-slate-500">기록</h2>
      <ul className="divide-y">
        {sessions.map((s) => {
          const edits = listEdits(s.id);
          return (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}</span>
                <span className="text-slate-600">
                  {s.ended_at ? `${(((s.ended_at as number) - s.started_at) / 3600).toFixed(1)}h` : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{STATUS_LABEL[s.status] ?? s.status}</span>
              </div>
              {s.status === "unresolved" && <UnresolvedReport sessionId={s.id} startedAt={s.started_at} />}
              {edits.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {edits.map((e) => (
                    <li key={e.id}>
                      {fmt(e.edited_at)} · {e.editor_email} 수정{e.reason ? ` — ${e.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
