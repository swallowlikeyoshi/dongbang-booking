"use client";

import { useState } from "react";

export default function ReviewButtons({ sessionId }: { sessionId: number }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(approve: boolean) {
    setError("");
    setBusy(true);
    const trimmedReason = reason.trim();
    const body: { sessionId: number; approve: boolean; reason?: string } = { sessionId, approve };
    if (trimmedReason) body.reason = trimmedReason;

    const r = await fetch("/api/attendance/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      window.location.reload();
      return;
    }
    const j = await r.json().catch(() => null);
    setError(j?.error ?? "처리에 실패했습니다.");
    setBusy(false);
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        className="rounded border px-2 py-1 text-sm"
        placeholder="거부 사유 (선택)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(true)}>승인</button>
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(false)}>거부</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
