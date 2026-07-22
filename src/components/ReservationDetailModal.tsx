"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEAM_COLORS, type Team } from "@/lib/constants";
import type { Reservation } from "@/lib/db/queries";

export default function ReservationDetailModal({
  reservation, roomName, sessionEmail, isAdmin, onClose,
}: {
  reservation: Reservation;
  roomName: string;
  sessionEmail: string | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  const canCancel = sessionEmail !== null && (sessionEmail === reservation.user_email || isAdmin);

  async function cancel() {
    if (!confirm("예약을 취소할까요?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "취소 실패");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-gray-800">{roomName} 예약</h3>

        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              TEAM_COLORS[reservation.team as Team] ?? "bg-slate-500"
            }`}
          />
          <span className="text-sm font-medium text-gray-800">{reservation.team}</span>
        </div>

        <p className="mb-1 text-sm text-gray-700">
          {reservation.title ? reservation.title : "(설명 없음)"}
        </p>
        <p className="mb-1 text-sm text-gray-500">예약자: {reservation.user_name}</p>
        <p className="mb-4 text-sm text-gray-500">
          {fmt(reservation.start_at)} ~ {fmt(reservation.end_at)}
        </p>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {canCancel && (
            <button
              disabled={busy}
              className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              onClick={cancel}
            >
              취소
            </button>
          )}
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
