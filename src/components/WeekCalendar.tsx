"use client";

import { TEAM_COLORS, type Team } from "@/lib/constants";
import { dayColumns, slotRows } from "@/lib/week";
import type { Reservation, Room } from "@/lib/db/queries";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function WeekCalendar({
  rooms, reservations, weekStartTs, onSlotClick,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
  onSlotClick?: (roomId: number, startTs: number) => void;
}) {
  const days = dayColumns(weekStartTs);
  const rows = slotRows();

  function resAt(roomId: number, dayTs: number, hour: number, min: number): Reservation | undefined {
    const slot = dayTs + hour * 3600 + min * 60;
    return reservations.find(
      (r) => r.room_id === roomId && r.start_at <= slot && slot < r.end_at,
    );
  }

  return (
    <div className="space-y-10">
      {rooms.map((room) => (
        <section key={room.id}>
          <h2 className="mb-3 text-base font-semibold text-gray-800">{room.name}</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-14 border-b border-gray-200 p-2"></th>
                  {days.map((dTs, i) => (
                    <th
                      key={dTs}
                      className="border-b border-l border-gray-200 p-2 text-center font-medium text-gray-600"
                    >
                      <span className="text-gray-800">{DAYS[i]}</span>
                      <span className="ml-1 text-gray-400">{new Date(dTs * 1000).getDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ hour, min }) => (
                  <tr key={`${hour}:${min}`}>
                    <td className="border-b border-gray-100 p-1 text-right align-top text-[11px] text-gray-400">
                      {min === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </td>
                    {days.map((dTs) => {
                      const r = resAt(room.id, dTs, hour, min);
                      const slotTs = dTs + hour * 3600 + min * 60;
                      const isStart = r && r.start_at === slotTs;
                      return (
                        <td
                          key={dTs}
                          onClick={() => !r && onSlotClick?.(room.id, slotTs)}
                          className={`h-6 border-b border-l border-gray-100 ${
                            r
                              ? `${TEAM_COLORS[r.team as Team]} text-white`
                              : "cursor-pointer hover:bg-gray-50"
                          }`}
                        >
                          {isStart ? (
                            <span className="block truncate px-1 text-[11px] leading-6">
                              {r!.team}
                              {r!.title ? ` · ${r!.title}` : ""}
                            </span>
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
