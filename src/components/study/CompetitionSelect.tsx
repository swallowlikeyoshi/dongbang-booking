"use client";

import { useState } from "react";
import { COMPETITIONS } from "@/lib/constants";

export default function CompetitionSelect({
  memberId,
  value,
}: {
  memberId: number;
  value: string | null;
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(next: string) {
    const prev = current;
    setCurrent(next);
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/attendance/competition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, competition: next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setCurrent(prev); // 저장 실패를 성공처럼 보이게 두지 않는다.
        setError(j?.error ?? "저장 실패");
      }
    } catch {
      setCurrent(prev);
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select
        className="w-full max-w-[6.5rem] rounded border border-slate-300 bg-white px-1 py-0.5 text-xs disabled:opacity-50"
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">미배정</option>
        {COMPETITIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
