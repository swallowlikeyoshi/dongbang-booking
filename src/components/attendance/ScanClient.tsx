"use client";

import { useEffect, useRef, useState } from "react";

type State =
  | { s: "loading" }
  | { s: "done"; kind: "checked_in" | "checked_out"; startedAt: number; endedAt: number | null }
  | { s: "error"; message: string };

function clock(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function ScanClient({ pendingId, memberName }: { pendingId: string; memberName: string }) {
  const [state, setState] = useState<State>({ s: "loading" });
  // StrictMode 에서 effect 가 두 번 실행되면 두 번째 요청이 만료 응답을 받아
  // 성공한 스캔이 실패로 보인다. 마운트당 한 번만 보낸다.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fetch("/api/attendance/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) return setState({ s: "error", message: j?.error ?? "처리에 실패했습니다." });
        setState({ s: "done", kind: j.kind, startedAt: j.session.started_at, endedAt: j.session.ended_at });
      })
      .catch(() => setState({ s: "error", message: "네트워크 오류입니다. 잠시 후 다시 스캔해주세요." }));
  }, [pendingId]);

  if (state.s === "loading") {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-slate-500">기록하는 중…</p>
      </main>
    );
  }

  if (state.s === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-xl font-medium text-red-900">기록하지 못했습니다</h1>
          <p className="mt-2 text-sm text-red-900/90">{state.message}</p>
          <p className="mt-3 text-sm text-red-900/70">
            동방 화면의 QR은 60초마다 바뀝니다. 화면을 다시 보고 <b>새 QR</b>을 찍어주세요.
          </p>
        </div>
        <a className="mt-5 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm" href="/study">
          내 스터디 현황 보기
        </a>
      </main>
    );
  }

  const checkedIn = state.kind === "checked_in";
  const mins = state.endedAt ? Math.round((state.endedAt - state.startedAt) / 60) : 0;

  return (
    <main className="mx-auto max-w-md p-6">
      <div
        className={`rounded-xl border p-5 ${
          checkedIn ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <h1 className={`text-2xl font-medium ${checkedIn ? "text-sky-900" : "text-emerald-900"}`}>
          {checkedIn ? "스터디를 시작했습니다" : "스터디를 종료했습니다"}
        </h1>
        <p className={`mt-1 text-sm ${checkedIn ? "text-sky-900/80" : "text-emerald-900/80"}`}>{memberName}</p>

        {checkedIn ? (
          <>
            <p className="mt-4 text-lg text-sky-900">
              시작 <b>{clock(state.startedAt)}</b>
            </p>
            <div className="mt-4 rounded-lg bg-white/70 p-3 text-sm text-sky-900">
              <b>나갈 때 같은 QR을 한 번 더 찍어주세요.</b>
              <br />
              그래야 시간이 자동으로 인정됩니다.
            </div>
            <p className="mt-3 text-xs text-sky-900/70">
              깜빡하고 그냥 나가면 10시간 뒤 자동 마감되고, 종료 시각을 직접 신고해야 인정됩니다.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-lg text-emerald-900">
              {clock(state.startedAt)} – {clock(state.endedAt as number)}
            </p>
            <p className="mt-1 text-3xl font-medium text-emerald-900">
              {Math.floor(mins / 60)}시간 {mins % 60}분
            </p>
            <div className="mt-4 rounded-lg bg-white/70 p-3 text-sm text-emerald-900">
              QR로 종료해서 <b>바로 인정</b>되었습니다. 별도 승인이 필요 없습니다.
            </div>
          </>
        )}
      </div>

      <a
        className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        href="/study"
      >
        내 스터디 현황 보기
      </a>
    </main>
  );
}
