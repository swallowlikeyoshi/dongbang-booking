"use client";

import { useState } from "react";

export default function ReviewButtons({ sessionId }: { sessionId: number }) {
  const [busy, setBusy] = useState(false);

  async function send(approve: boolean) {
    const reason = approve ? undefined : (prompt("거부 사유(선택)") ?? undefined);
    setBusy(true);
    const r = await fetch("/api/attendance/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, approve, reason }),
    });
    setBusy(false);
    if (r.ok) window.location.reload();
    else alert("처리에 실패했습니다.");
  }

  return (
    <span className="flex gap-2">
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(true)}>승인</button>
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(false)}>거부</button>
    </span>
  );
}
