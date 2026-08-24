import { listSessionsByMember, listEdits, type StudySession } from "@/lib/attendance/sessions";
import { countedSecondsBySession, dailyBuckets, memberTotals, weekSecondsFor } from "@/lib/attendance/aggregate";

import { weekStart } from "@/lib/week";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import type { Member } from "@/lib/db/members";
import ContributionGrid from "@/components/attendance/ContributionGrid";
import { formatDuration } from "@/lib/attendance/format";
import UnresolvedReport from "@/components/attendance/UnresolvedReport";
import DeleteSessionButton from "@/components/attendance/DeleteSessionButton";

const STATUS_LABEL: Record<string, string> = {
  open: "진행 중",
  deleted: "삭제됨",
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

/**
 * 팀 쿼터에 걸려 깎인 기록에만 붙는 한 줄. 온전히 인정된 기록에는
 * 아무것도 붙지 않는다 — 정상인 줄마다 배지가 붙으면 눈에 안 들어온다.
 */
function QuotaNote({ session, counted }: { session: StudySession; counted?: number }) {
  if (session.ended_at === null || counted === undefined) return null;
  const full = (session.ended_at as number) - session.started_at;
  if (counted >= full) return null;
  return (
    <p className="mt-1 text-xs text-amber-700">
      {counted === 0
        ? "팀 주간 쿼터를 다 써서 이 기록은 인정되지 않았습니다."
        : `팀 주간 쿼터에 걸려 ${formatDuration(counted)}만 인정되었습니다.`}
    </p>
  );
}

export default function MySection({ member }: { member: Member }) {
  const now = Math.floor(Date.now() / 1000);
  const sessions = listSessionsByMember(member.id);
  
  const totals = memberTotals()
    .find((t) => t.member.id === member.id);
  const isCapped = totals && totals.rawSeconds !== totals.countedSeconds;
  // 쿼터에 걸려 일부만 인정된 기록을 그 자리에서 알려준다 — 총합만 줄어 있고
  // 어느 기록이 깎였는지 모르면 규칙이 불신을 산다.
  const countedById = countedSecondsBySession(member.id);
  const buckets = dailyBuckets(member.id, now - 26 * 7 * 86400, now);
  const weekSeconds = weekSecondsFor(sessions, weekStart(now));
  const color = SUB_TEAM_COLORS[member.sub_team as SubTeam] ?? "#2a78d6";

  // 미확정 기록은 본인이 신고해야 시간이 인정되므로 잘려서 숨으면 안 된다.
  const deleted = sessions.filter((s) => s.status === "deleted");
  const live = sessions.filter((s) => s.status !== "deleted");
  const unresolved = live.filter((s) => s.status === "unresolved");
  const pendingCount = live.filter((s) => s.status === "pending").length;
  const recent = live.slice(0, RECENT_LIMIT);
  const shown = [...unresolved, ...recent.filter((s) => s.status !== "unresolved")];
  const hidden = live.length - shown.length;

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
              쿼터 적용 전 {formatDuration(totals.rawSeconds)} · 팀 주간 쿼터를 넘어선 시간은 빠집니다
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
                <DeleteSessionButton sessionId={s.id} />
              </div>
              <QuotaNote session={s} counted={countedById.get(s.id)} />
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
            {live.slice(RECENT_LIMIT).filter((s) => s.status !== "unresolved").map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="flex-1">{fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}</span>
                <span className="text-slate-600">
                  {s.ended_at ? formatDuration((s.ended_at as number) - s.started_at) : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <DeleteSessionButton sessionId={s.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {deleted.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-slate-500">
            삭제한 기록 {deleted.length}건 보기
          </summary>
          <p className="mt-2 text-xs text-slate-400">
            집계에서 빠진 기록입니다. 되살리려면 관리자에게 문의하세요.
          </p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {deleted.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-slate-400">
                <span className="flex-1 line-through">
                  {fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}
                </span>
                <span>{s.ended_at ? formatDuration((s.ended_at as number) - s.started_at) : "—"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
