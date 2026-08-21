"use client";

import { useState } from "react";

const NOTE_MAX = 100;

export default function UnresolvedReport({ sessionId, startedAt }: { sessionId: number; startedAt: number }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!value) return setError("종료 시각을 입력해주세요.");
    const endedAt = Math.floor(new Date(value).getTime() / 1000);
    if (!Number.isFinite(endedAt)) return setError("시각 형식이 올바르지 않습니다.");
    if (endedAt <= startedAt) return setError("시작 시각보다 뒤여야 합니다.");

    const trimmedNote = note.trim();
    const body: { sessionId: number; endedAt: number; note?: string } = { sessionId, endedAt };
    if (trimmedNote) body.note = trimmedNote;

    const r = await fetch("/api/attendance/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "신고에 실패했습니다.");
    window.location.reload();
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
      <button className="rounded border px-3 py-1 text-sm" onClick={submit}>종료 시각 신고</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
