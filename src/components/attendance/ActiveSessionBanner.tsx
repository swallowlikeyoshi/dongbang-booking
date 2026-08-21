"use client";

import { useEffect, useState } from "react";

type Session = { id: number; started_at: number; room_id: number };

const ROOM_NAMES: Record<number, string> = {
  1: "공학실습동 24214",
  2: "학생회관 03324",
  3: "공작실 24112A",
};

export default function ActiveSessionBanner() {
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    fetch("/api/attendance/session").then((r) => r.json()).then((j) => setSession(j.session));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!session) return null;

  const elapsed = Math.max(0, now - session.started_at);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);

  /** 위치는 best-effort 첨부다. 거부하거나 실패해도 종료는 그대로 진행된다. */
  function coords(): Promise<{ lat?: number; lng?: number }> {
    if (!navigator.geolocation) return Promise.resolve({});
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 5000, maximumAge: 60_000 },
      );
    });
  }

  async function stop() {
    if (!confirm("QR 없이 종료하면 보정 신고로 기록되어 관리자 승인이 필요합니다. 종료할까요?")) return;
    const where = await coords();
    const r = await fetch("/api/attendance/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(where),
    });
    if (r.ok) setSession(null);
  }

  return (
    <div className="flex items-center gap-3 bg-sky-50 px-4 py-2 text-sm">
      <span className="font-medium text-sky-900">스터디 중</span>
      <span className="text-sky-800">{ROOM_NAMES[session.room_id] ?? "동방"} · {h}시간 {m}분</span>
      <button className="ml-auto rounded border border-sky-700 px-3 py-1 text-sky-900" onClick={stop}>
        종료
      </button>
    </div>
  );
}
