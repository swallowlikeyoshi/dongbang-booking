import { listSessionsByMember, listEdits } from "@/lib/attendance/sessions";
import { dailyBuckets, memberTotals, weekSecondsFor } from "@/lib/attendance/aggregate";
import { getWeeklyCapSeconds } from "@/lib/attendance/settings";
import { weekStart } from "@/lib/week";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import type { Member } from "@/lib/db/members";
import ContributionGrid from "@/components/attendance/ContributionGrid";
import { formatDuration } from "@/lib/attendance/format";
import UnresolvedReport from "@/components/attendance/UnresolvedReport";

const STATUS_LABEL: Record<string, string> = {
  open: "진행 중",
  confirmed: "QR 종료",
  pending: "보정 승인 대기",
  approved: "보정 승인됨",
  rejected: "거부됨",
  unresolved: "미확정 · 신고 필요",
};

/** 기록 목록은 길어지면 순위·팀 현황을 아래로 밀어내므로 최근 것만 펼쳐 둔다. */
const RECENT_LIMIT = 8;

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function MySection({ member }: { member: Member }) {
  const now = Math.floor(Date.now() / 1000);
  const sessions = listSessionsByMember(member.id);
  const cap = getWeeklyCapSeconds();
  const totals = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined)
    .find((t) => t.member.id === member.id);
  const isCapped = cap && totals && totals.rawSeconds !== totals.countedSeconds;
  const buckets = dailyBuckets(member.id, now - 26 * 7 * 86400, now);
  const weekSeconds = weekSecondsFor(sessions, weekStart(now));
  const color = SUB_TEAM_COLORS[member.sub_team as SubTeam] ?? "#2a78d6";

  // 미확정 기록은 본인이 신고해야 시간이 인정되므로 잘려서 숨으면 안 된다.
  const unresolved = sessions.filter((s) => s.status === "unresolved");
  const pendingCount = sessions.filter((s) => s.status === "pending").length;
  const recent = sessions.slice(0, RECENT_LIMIT);
  const shown = [...unresolved, ...recent.filter((s) => s.status !== "unresolved")];
  const hidden = sessions.length - shown.length;

  return (
    <section id="me" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 pb-3">
        <h2 className="text-lg font-medium">내 스터디</h2>
        <span className="text-sm text-slate-500">{member.name} · {member.sub_team}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">누적</div>
          <div className="text-2xl">{formatDuration(totals?.countedSeconds ?? 0)}</div>
          {isCapped && totals && (
            <div className="mt-1 text-xs text-slate-400">
              상한 전 {formatDuration(totals.rawSeconds)} · 주간 인정 상한 {(cap! / 3600).toFixed(0)}시간 적용
            </div>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">이번 주</div>
          <div className="text-2xl">{formatDuration(weekSeconds)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">승인 대기</div>
          <div className="text-2xl">{pendingCount}건</div>
          {pendingCount > 0 && (
            <div className="mt-1 text-xs text-slate-400">QR 없이 종료해 관리자 확인을 기다리는 기록</div>
          )}
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-sm text-slate-500">최근 26주</h3>
      <ContributionGrid buckets={buckets} weeks={26} color={color} showWeekdays />

      <h3 className="mt-6 mb-2 text-sm text-slate-500">기록</h3>
      {shown.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          아직 기록이 없습니다. 동방 화면의 QR을 스캔하면 시작됩니다.
        </p>
      )}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {shown.map((s) => {
          const edits = listEdits(s.id);
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}</span>
                <span className="text-slate-600">
                  {s.ended_at ? formatDuration((s.ended_at as number) - s.started_at) : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
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
      {hidden > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-blue-600">이전 기록 {hidden}건 더 보기</summary>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {sessions.slice(RECENT_LIMIT).filter((s) => s.status !== "unresolved").map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="flex-1">{fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}</span>
                <span className="text-slate-600">
                  {s.ended_at ? formatDuration((s.ended_at as number) - s.started_at) : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
