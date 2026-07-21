"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WeekCalendar from "./WeekCalendar";
import ReservationModal from "./ReservationModal";
import type { Reservation, Room } from "@/lib/db/queries";

export default function HomeClient({
  rooms, reservations, weekStartTs,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<{ roomId: number; startTs: number } | null>(null);

  function go(deltaWeeks: number) {
    const w = weekStartTs + deltaWeeks * 7 * 24 * 3600;
    router.push(`/?w=${w}`);
  }

  const selRoom = sel ? rooms.find((r) => r.id === sel.roomId) : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={() => go(-1)}
        >
          ← 이전 주
        </button>
        <button
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={() => go(1)}
        >
          다음 주 →
        </button>
        <span className="text-sm text-gray-500">
          {new Date(weekStartTs * 1000).toLocaleDateString("ko-KR")} 주간
        </span>
      </div>

      <WeekCalendar
        rooms={rooms}
        reservations={reservations}
        weekStartTs={weekStartTs}
        onSlotClick={(roomId, startTs) => setSel({ roomId, startTs })}
      />

      {sel && selRoom && (
        <ReservationModal
          roomId={sel.roomId}
          roomName={selRoom.name}
          startTs={sel.startTs}
          onClose={() => setSel(null)}
          onCreated={() => { setSel(null); router.refresh(); }}
        />
      )}
    </>
  );
}
