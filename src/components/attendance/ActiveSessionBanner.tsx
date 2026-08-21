"use client";

import { useEffect, useRef, useState } from "react";

type Session = { id: number; started_at: number; room_id: number };

export default function ActiveSessionBanner() {
  const [session, setSession] = useState<Session | null>(null);
  const [roomName, setRoomName] = useState<string>("동방");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // 슬로우 네트워크에서 이전 요청이 아직 끝나지 않았으면 이번 틱은 건너뛴다.
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const r = await fetch("/api/attendance/session");
        const j = await r.json();
        if (cancelled) return;
        setSession(j.session);
        setRoomName(j.roomName ?? "동방");
        setNow(Math.floor(Date.now() / 1000));
        setError(null);
      } finally {
        fetchingRef.current = false;
      }
    }

    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
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
    setStopping(true);
    setError(null);
    try {
      const where = await coords();
      const r = await fetch("/api/attendance/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(where),
      });
      if (r.ok) {
        setSession(null);
      } else {
        const j = await r.json().catch(() => ({}));
        setError(typeof j?.error === "string" ? j.error : "종료 처리에 실패했습니다.");
      }
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 bg-sky-50 px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-medium text-sky-900">스터디 중</span>
        <span className="text-sky-800">{roomName} · {h}시간 {m}분</span>
        <button
          className="ml-auto rounded border border-sky-700 px-3 py-1 text-sky-900 disabled:opacity-50"
          onClick={stop}
          disabled={stopping}
        >
          {stopping ? "종료 중…" : "종료"}
        </button>
      </div>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
