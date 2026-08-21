"use client";

import { useState } from "react";

const NOTE_MAX = 100;

export default function UnresolvedReport({ sessionId, startedAt }: { sessionId: number; startedAt: number }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (!value) return setError("종료 시각을 입력해주세요.");
    const endedAt = Math.floor(new Date(value).getTime() / 1000);
    if (!Number.isFinite(endedAt)) return setError("시각 형식이 올바르지 않습니다.");
    if (endedAt <= startedAt) return setError("시작 시각보다 뒤여야 합니다.");

    const trimmedNote = note.trim();
    const body: { sessionId: number; endedAt: number; note?: string } = { sessionId, endedAt };
    if (trimmedNote) body.note = trimmedNote;

    setBusy(true);
    try {
      const r = await fetch("/api/attendance/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        window.location.reload();
        return;
      }
      const j = await r.json().catch(() => null);
      setError(j?.error ?? "신고에 실패했습니다.");
    } catch {
      // fetch 자체가 거부된 경우(오프라인, DNS 실패, 연결 끊김 등) — 응답이
      // 없으므로 별도 네트워크 오류 메시지를 보여준다.
      setError("네트워크 오류로 신고하지 못했습니다. 다시 시도해주세요.");
    } finally {
      // 성공(reload) 경로를 포함해 항상 실행된다 — 어떤 경로로 끝나든 버튼이
      // 영구히 비활성 상태로 남지 않도록 보장한다.
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        className="rounded border px-2 py-1 text-sm"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(""); }}
      />
      <input
        type="text"
        className="rounded border px-2 py-1 text-sm"
        placeholder="사유 (선택)"
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={submit}>종료 시각 신고</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
