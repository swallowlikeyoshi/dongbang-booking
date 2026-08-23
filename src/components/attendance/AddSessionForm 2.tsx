"use client";

import { useState } from "react";

type Room = { id: number; name: string };

/** 오늘 날짜에 기본 시각을 채워 둔다. 매번 날짜부터 고르게 하면 손이 많이 간다. */
function defaultInput(hour: number): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

export default function AddSessionForm({
  memberId,
  memberName,
  rooms,
}: {
  memberId: number;
  memberName: string;
  rooms: Room[];
}) {
  const [roomId, setRoomId] = useState(String(rooms[0]?.id ?? 1));
  const [start, setStart] = useState(defaultInput(19));
  const [end, setEnd] = useState(defaultInput(21));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setError("");
    const s = Math.floor(new Date(start).getTime() / 1000);
    const e = Math.floor(new Date(end).getTime() / 1000);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return setError("시각을 모두 입력해주세요.");
    setBusy(true);
    try {
      const r = await fetch("/api/attendance/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, roomId: Number(roomId), startedAt: s, endedAt: e, note }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setError(j?.error ?? "추가에 실패했습니다.");
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
    <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-medium">{memberName} 기록 추가</h3>
      <p className="mt-1 text-xs text-slate-500">
        QR 장비가 없는 방의 스터디를 직접 넣습니다. 관리자 이름으로 이력이 남고 바로 인정됩니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input type="datetime-local" className="rounded border px-2 py-1 text-sm"
               value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="text-slate-400">–</span>
        <input type="datetime-local" className="rounded border px-2 py-1 text-sm"
               value={end} onChange={(e) => setEnd(e.target.value)} />
        <input className="min-w-[10rem] flex-1 rounded border px-2 py-1 text-sm"
               placeholder="비고 (선택)" maxLength={100}
               value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                disabled={busy} onClick={add}>추가</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
