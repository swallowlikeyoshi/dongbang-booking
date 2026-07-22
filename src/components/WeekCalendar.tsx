"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TEAM_COLORS, type Team } from "@/lib/constants";
import { dayColumns, slotRows } from "@/lib/week";
import type { Reservation, Room } from "@/lib/db/queries";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type DragState = {
  roomId: number;
  dayTs: number;
  anchorIdx: number;
  currentIdx: number;
};

export default function WeekCalendar({
  rooms, reservations, weekStartTs, onSelect,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
  onSelect?: (roomId: number, startTs: number, endTs: number) => void;
}) {
  const days = dayColumns(weekStartTs);
  const rows = slotRows();
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  function isOccupied(roomId: number, dayTs: number, rowIdx: number): boolean {
    const row = rows[rowIdx];
    if (!row) return false;
    return resAt(roomId, dayTs, row.hour, row.min) !== undefined;
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLTableCellElement>,
    roomId: number,
    dayTs: number,
    idx: number,
  ) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const s: DragState = { roomId, dayTs, anchorIdx: idx, currentIdx: idx };
    dragRef.current = s;
    setDrag(s);
  }

  function extendDrag(roomId: number, dayTs: number, idx: number) {
    const cur = dragRef.current;
    if (cur && cur.roomId === roomId && cur.dayTs === dayTs) {
      const direction = Math.sign(idx - cur.anchorIdx);
      let target = idx;
      if (direction !== 0) {
        for (let i = cur.anchorIdx; i !== idx; i += direction) {
          const nextIdx = i + direction;
          if (isOccupied(roomId, dayTs, nextIdx)) {
            target = i;
            break;
          }
        }
      }
      const s: DragState = { ...cur, currentIdx: target };
      dragRef.current = s;
      setDrag(s);
    }
  }

  useEffect(() => {
    function handlePointerUp() {
      const cur = dragRef.current;
      if (!cur) return;
      const minIdx = Math.min(cur.anchorIdx, cur.currentIdx);
      const maxIdx = Math.max(cur.anchorIdx, cur.currentIdx);
      const first = rows[minIdx];
      const last = rows[maxIdx];
      const startTs = cur.dayTs + first.hour * 3600 + first.min * 60;
      const endTs = cur.dayTs + last.hour * 3600 + last.min * 60 + 1800;
      dragRef.current = null;
      setDrag(null);
      onSelect?.(cur.roomId, startTs, endTs);
    }
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, onSelect]);

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
                {rows.map(({ hour, min }, rowIdx) => (
                  <tr key={`${hour}:${min}`}>
                    <td className="border-b border-gray-100 p-1 text-right align-top text-[11px] text-gray-400">
                      {min === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </td>
                    {days.map((dTs) => {
                      const r = resAt(room.id, dTs, hour, min);
                      const slotTs = dTs + hour * 3600 + min * 60;
                      const isStart = r && r.start_at === slotTs;
                      const isSelected =
                        !r &&
                        drag !== null &&
                        drag.roomId === room.id &&
                        drag.dayTs === dTs &&
                        rowIdx >= Math.min(drag.anchorIdx, drag.currentIdx) &&
                        rowIdx <= Math.max(drag.anchorIdx, drag.currentIdx);

                      if (r) {
                        return (
                          <td
                            key={dTs}
                            className={`h-6 border-b border-l border-gray-100 ${
                              TEAM_COLORS[r.team as Team] ?? "bg-slate-500"
                            } text-white`}
                          >
                            {isStart ? (
                              <span className="block truncate px-1 text-[11px] leading-6">
                                {r.team}
                                {r.title ? ` · ${r.title}` : ""}
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={dTs}
                          onPointerDown={(e) => beginDrag(e, room.id, dTs, rowIdx)}
                          onPointerEnter={() => extendDrag(room.id, dTs, rowIdx)}
                          className={`h-6 touch-none border-b border-l border-gray-100 cursor-pointer select-none ${
                            isSelected ? "bg-blue-100" : "hover:bg-gray-50"
                          }`}
                        >
                          {""}
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
