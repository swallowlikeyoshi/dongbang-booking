"use client";

import { useState } from "react";

/** Unix 초 → datetime-local 입력값(로컬 시각). 컨테이너 TZ 는 Asia/Seoul 고정. */
function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SessionTimeEditor({
  sessionId,
  startedAt,
  endedAt,
}: {
  sessionId: number;
  startedAt: number;
  endedAt: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toLocalInput(startedAt));
  const [end, setEnd] = useState(endedAt ? toLocalInput(endedAt) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const s = Math.floor(new Date(start).getTime() / 1000);
    const e = Math.floor(new Date(end).getTime() / 1000);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return setError("시각을 모두 입력해주세요.");
    setBusy(true);
    try {
      const r = await fetch("/api/attendance/session/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, startedAt: s, endedAt: e, reason: reason.trim() || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setError(j?.error ?? "저장에 실패했습니다.");
        return;
      }
      window.location.reload();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600"
        onClick={() => setOpen(true)}
      >
        시각 수정
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" className="rounded border px-2 py-1 text-sm"
               value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="text-slate-400">–</span>
        <input type="datetime-local" className="rounded border px-2 py-1 text-sm"
               value={end} onChange={(e) => setEnd(e.target.value)} />
        <input className="min-w-[8rem] flex-1 rounded border px-2 py-1 text-sm"
               placeholder="사유 (선택)" maxLength={100}
               value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                disabled={busy} onClick={save}>저장</button>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => setOpen(false)}>취소</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
