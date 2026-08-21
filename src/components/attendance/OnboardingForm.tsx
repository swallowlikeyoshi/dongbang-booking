"use client";

import { useState } from "react";
import { SUB_TEAMS } from "@/lib/constants";

type Found = { name: string; subTeam: string } | { unknown: true } | null;

export default function OnboardingForm({ pending }: { pending: string | null }) {
  const [studentNo, setStudentNo] = useState("");
  const [found, setFound] = useState<Found>(null);
  const [name, setName] = useState("");
  const [subTeam, setSubTeam] = useState<string>(SUB_TEAMS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setError("");
    if (!/^\d{10}$/.test(studentNo)) return setError("학번 10자리를 입력해주세요.");
    setBusy(true);
    const r = await fetch(`/api/attendance/claim?studentNo=${studentNo}`);
    const j = await r.json();
    setBusy(false);
    if (j.taken) return setError("이미 다른 계정이 등록한 학번입니다. 관리자에게 문의하세요.");
    setFound(j.found ? { name: j.name, subTeam: j.subTeam } : { unknown: true });
  }

  async function confirm() {
    setError("");
    setBusy(true);
    const payload: Record<string, string> = { studentNo };
    if (found && "unknown" in found) {
      if (!name.trim()) { setBusy(false); return setError("이름을 입력해주세요."); }
      payload.name = name;
      payload.subTeam = subTeam;
    }
    const r = await fetch("/api/attendance/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "등록에 실패했습니다.");
    window.location.href = pending ? `/c/apply/${pending}` : "/study";
  }

  return (
    <div className="space-y-4">
      {!found && (
        <>
          <label className="block">
            <span className="text-sm text-slate-600">학번</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              inputMode="numeric"
              value={studentNo}
              onChange={(e) => { setStudentNo(e.target.value.replace(/\D/g, "")); setError(""); }}
              placeholder="2025312077"
            />
          </label>
          <button className="w-full rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={lookup}>
            확인
          </button>
        </>
      )}

      {found && "name" in found && (
        <>
          <p className="text-lg">
            <strong>{found.name}</strong> · {found.subTeam}, 맞나요?
          </p>
          <div className="flex gap-2">
            <button className="flex-1 rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={confirm}>
              맞습니다
            </button>
            <button className="flex-1 rounded border px-4 py-2" onClick={() => { setFound(null); setStudentNo(""); }}>
              다시 입력
            </button>
          </div>
        </>
      )}

      {found && "unknown" in found && (
        <>
          <p className="text-sm text-slate-600">명부에 없는 학번입니다. 직접 입력하면 관리자 승인 후 정식 등록됩니다.</p>
          <label className="block">
            <span className="text-sm text-slate-600">이름</span>
            <input className="mt-1 w-full rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">세부팀</span>
            <select className="mt-1 w-full rounded border px-3 py-2" value={subTeam} onChange={(e) => setSubTeam(e.target.value)}>
              {SUB_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="w-full rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={confirm}>
            등록
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
