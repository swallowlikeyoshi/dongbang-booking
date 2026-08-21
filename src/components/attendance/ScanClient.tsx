"use client";

import { useEffect, useState } from "react";

type State =
  | { s: "loading" }
  | { s: "done"; kind: "checked_in" | "checked_out"; startedAt: number; endedAt: number | null }
  | { s: "error"; message: string };

export default function ScanClient({ pendingId, memberName }: { pendingId: string; memberName: string }) {
  const [state, setState] = useState<State>({ s: "loading" });

  useEffect(() => {
    fetch("/api/attendance/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) return setState({ s: "error", message: j.error ?? "처리에 실패했습니다." });
        setState({ s: "done", kind: j.kind, startedAt: j.session.started_at, endedAt: j.session.ended_at });
      })
      .catch(() => setState({ s: "error", message: "네트워크 오류입니다." }));
  }, [pendingId]);

  if (state.s === "loading") return <main className="mx-auto max-w-md p-6">처리 중…</main>;
  if (state.s === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl">기록하지 못했습니다</h1>
        <p className="mt-2 text-slate-600">{state.message}</p>
        <a className="mt-4 inline-block underline" href="/study">내 스터디 현황</a>
      </main>
    );
  }

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const mins = state.endedAt ? Math.round((state.endedAt - state.startedAt) / 60) : 0;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl">{state.kind === "checked_in" ? "스터디 시작" : "스터디 종료"}</h1>
      <p className="mt-2 text-slate-700">
        {memberName} · {fmt(state.startedAt)}
        {state.endedAt ? ` – ${fmt(state.endedAt)} (${Math.floor(mins / 60)}시간 ${mins % 60}분)` : ""}
      </p>
      <a className="mt-6 inline-block underline" href="/study">내 스터디 현황 보기</a>
    </main>
  );
}
