"use client";

import { useState } from "react";

export default function SettingsForm({ initial }: { initial: { weekly_cap_hours: string; entry_quota: string } }) {
  const [cap, setCap] = useState(initial.weekly_cap_hours);
  const [quota, setQuota] = useState(initial.entry_quota);
  const [msg, setMsg] = useState("");

  async function save(key: string, value: string) {
    setMsg("");
    const r = await fetch("/api/attendance/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const j = await r.json();
    setMsg(r.ok ? "저장했습니다." : (j.error ?? "저장에 실패했습니다."));
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="block">
        <span className="text-sm text-slate-600">주간 인정 상한(시간)</span>
        <div className="mt-1 flex gap-2">
          <input className="w-28 rounded border px-2 py-1" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="없음" />
          <button className="rounded border px-3 py-1" onClick={() => save("weekly_cap_hours", cap)}>저장</button>
        </div>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">엔트리 정원(명)</span>
        <div className="mt-1 flex gap-2">
          <input className="w-28 rounded border px-2 py-1" value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="없음" />
          <button className="rounded border px-3 py-1" onClick={() => save("entry_quota", quota)}>저장</button>
        </div>
      </label>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
