import { listSessionsByMember, listEdits } from "@/lib/attendance/sessions";
import { formatDuration } from "@/lib/attendance/format";
import type { Member } from "@/lib/db/members";
import SessionTimeEditor from "./SessionTimeEditor";
import DeleteSessionButton from "./DeleteSessionButton";

const STATUS_LABEL: Record<string, string> = {
  open: "진행 중",
  confirmed: "QR 종료",
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "거부됨",
  unresolved: "미확정",
  deleted: "삭제됨",
};

function fmt(ts: number | null) {
  if (ts === null) return "—";
  return new Date(ts * 1000).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function MemberSessionAdmin({ member }: { member: Member }) {
  const sessions = listSessionsByMember(member.id);
  const counted = sessions
    .filter((s) => ["confirmed", "pending", "approved"].includes(s.status) && s.ended_at !== null)
    .reduce((acc, s) => acc + ((s.ended_at as number) - s.started_at), 0);

  return (
    <div className="mt-4 rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 px-4 py-3">
        <span className="font-medium">{member.name}</span>
        <span className="text-sm text-slate-500">{member.sub_team}</span>
        <span className="ml-auto text-sm">인정 {formatDuration(counted)} · 기록 {sessions.length}건</span>
      </div>

      {sessions.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">기록이 없습니다.</p>
      )}

      <ul className="divide-y divide-slate-100">
        {sessions.map((s) => {
          const edits = listEdits(s.id);
          const isDeleted = s.status === "deleted";
          return (
            <li key={s.id} className={`px-4 py-3 ${isDeleted ? "bg-slate-50 text-slate-400" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`flex-1 text-sm ${isDeleted ? "line-through" : ""}`}>
                  {fmt(s.started_at)} – {fmt(s.ended_at)}
                </span>
                <span className="text-sm">
                  {s.ended_at ? formatDuration((s.ended_at as number) - s.started_at) : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.start_proof === "import" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">이관</span>
                )}
                {isDeleted ? (
                  <DeleteSessionButton sessionId={s.id} label="복구" restore />
                ) : (
                  <>
                    {s.ended_at !== null && (
                      <SessionTimeEditor sessionId={s.id} startedAt={s.started_at} endedAt={s.ended_at} />
                    )}
                    <DeleteSessionButton sessionId={s.id} />
                  </>
                )}
              </div>
              {s.note && <p className="mt-1 text-xs text-slate-500">{s.note}</p>}
              {edits.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {edits.map((e) => (
                    <li key={e.id}>
                      {fmt(e.edited_at)} · {e.editor_email}
                      {e.reason ? ` — ${e.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
