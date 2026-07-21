"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/constants";

export default function ReservationModal({
  roomId, roomName, startTs, onClose, onCreated,
}: {
  roomId: number;
  roomName: string;
  startTs: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [team, setTeam] = useState<string>(TEAMS[0]);
  const [title, setTitle] = useState("");
  const [durationSlots, setDurationSlots] = useState(1); // 30분 단위
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const endTs = startTs + durationSlots * 1800;
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_id: roomId, team, title, start_at: startTs, end_at: endTs }),
    });
    setBusy(false);
    if (res.status === 401) { setError("로그인이 필요합니다."); return; }
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "실패"); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-gray-800">{roomName} 예약</h3>
        <p className="mb-4 text-sm text-gray-500">{fmt(startTs)} ~ {fmt(endTs)}</p>

        <label className="block text-sm font-medium text-gray-700">
          팀
          <select
            className="mt-1 w-full rounded-md border border-gray-300 p-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-gray-700">
          설명(선택)
          <input
            className="mt-1 w-full rounded-md border border-gray-300 p-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 배터리팩 조립"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-gray-700">
          길이(30분 단위)
          <input
            type="number"
            min={1}
            max={48}
            className="mt-1 w-full rounded-md border border-gray-300 p-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            value={durationSlots}
            onChange={(e) => setDurationSlots(Math.max(1, Number(e.target.value)))}
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            취소
          </button>
          <button
            disabled={busy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={submit}
          >
            예약
          </button>
        </div>
      </div>
    </div>
  );
}
