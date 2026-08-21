"use client";

import { useState } from "react";

export default function DeleteSessionButton({
  sessionId,
  label = "삭제",
  restore = false,
}: {
  sessionId: number;
  label?: string;
  restore?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!restore && !confirm("이 기록을 삭제할까요? 집계에서 빠지지만 이력은 남습니다.")) return;
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/attendance/session/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, restore }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setError(j?.error ?? "실패했습니다.");
        return;
      }
      window.location.reload();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 disabled:opacity-50"
        disabled={busy}
        onClick={run}
      >
        {label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
