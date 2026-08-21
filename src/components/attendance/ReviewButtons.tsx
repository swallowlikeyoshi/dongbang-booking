"use client";

import { useState } from "react";

export default function ReviewButtons({ sessionId }: { sessionId: number }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(approve: boolean) {
    setError("");
    setBusy(true);
    try {
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
    } catch {
      // fetch 자체가 거부된 경우(오프라인, DNS 실패, 연결 끊김 등) — 응답이
      // 없으므로 별도 네트워크 오류 메시지를 보여준다.
      setError("네트워크 오류로 처리하지 못했습니다. 다시 시도해주세요.");
    } finally {
      // 성공(reload) 경로를 포함해 항상 실행된다 — 어떤 경로로 끝나든 버튼이
      // 영구히 비활성 상태로 남지 않도록 보장한다.
      setBusy(false);
    }
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
