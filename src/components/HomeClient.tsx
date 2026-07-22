"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WeekCalendar from "./WeekCalendar";
import ReservationModal from "./ReservationModal";
import ReservationDetailModal from "./ReservationDetailModal";
import type { Reservation, Room } from "@/lib/db/queries";

export default function HomeClient({
  rooms, reservations, weekStartTs, sessionEmail, isAdmin,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
  sessionEmail: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<{ roomId: number; startTs: number; endTs: number } | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(rooms[0]?.id ?? null);
  const [detail, setDetail] = useState<Reservation | null>(null);

  function go(deltaWeeks: number) {
    const w = weekStartTs + deltaWeeks * 7 * 24 * 3600;
    router.push(`/?w=${w}`);
  }

  const selRoom = sel ? rooms.find((r) => r.id === sel.roomId) : null;
  const detailRoom = detail ? rooms.find((r) => r.id === detail.room_id) : null;
  const activeRooms = rooms.filter((r) => r.id === activeRoomId);

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

      <div className="mb-3 flex gap-1 border-b border-gray-200">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setActiveRoomId(room.id)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium ${
              activeRoomId === room.id
                ? "border-blue-600 bg-white text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {room.name}
          </button>
        ))}
      </div>

      <WeekCalendar
        rooms={activeRooms}
        reservations={reservations}
        weekStartTs={weekStartTs}
        onSelect={(roomId, startTs, endTs) => setSel({ roomId, startTs, endTs })}
        onReservationClick={(r) => setDetail(r)}
      />

      {sel && selRoom && (
        <ReservationModal
          roomId={sel.roomId}
          roomName={selRoom.name}
          startTs={sel.startTs}
          endTs={sel.endTs}
          onClose={() => setSel(null)}
          onCreated={() => { setSel(null); router.refresh(); }}
        />
      )}

      {detail && detailRoom && (
        <ReservationDetailModal
          reservation={detail}
          roomName={detailRoom.name}
          sessionEmail={sessionEmail}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
