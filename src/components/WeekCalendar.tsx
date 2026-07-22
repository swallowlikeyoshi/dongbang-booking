"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  rooms, reservations, weekStartTs, onSelect, onReservationClick,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
  onSelect?: (roomId: number, startTs: number, endTs: number) => void;
  onReservationClick?: (r: Reservation) => void;
}) {
  const days = useMemo(() => dayColumns(weekStartTs), [weekStartTs]);
  const rows = useMemo(() => slotRows(), []);
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
          <div className="rounded-lg border border-gray-200 sm:overflow-x-auto">
            <NowLineTable
              room={room}
              days={days}
              rows={rows}
              weekStartTs={weekStartTs}
              resAt={resAt}
              drag={drag}
              beginDrag={beginDrag}
              extendDrag={extendDrag}
              onReservationClick={onReservationClick}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function NowLineTable({
  room, days, rows, weekStartTs, resAt, drag, beginDrag, extendDrag, onReservationClick,
}: {
  room: Room;
  days: number[];
  rows: { hour: number; min: number }[];
  weekStartTs: number;
  resAt: (roomId: number, dayTs: number, hour: number, min: number) => Reservation | undefined;
  drag: DragState | null;
  beginDrag: (event: ReactPointerEvent<HTMLTableCellElement>, roomId: number, dayTs: number, idx: number) => void;
  extendDrag: (roomId: number, dayTs: number, idx: number) => void;
  onReservationClick?: (r: Reservation) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [nowLine, setNowLine] = useState<{ top: number; leftFrac: number | null } | null>(null);

  useEffect(() => {
    function compute() {
      const now = new Date();
      const nowTs = Math.floor(now.getTime() / 1000);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayStartTs = Math.floor(todayStart.getTime() / 1000);

      const inWeek = days.includes(todayStartTs);
      if (!inWeek) {
        setNowLine(null);
        return;
      }

      const secondsSinceMidnight = nowTs - todayStartTs;
      const f = (secondsSinceMidnight - 8 * 3600) / (16 * 3600);
      if (f < 0 || f > 1) {
        setNowLine(null);
        return;
      }

      const tbody = tbodyRef.current;
      const wrap = wrapRef.current;
      if (!tbody || !wrap) return;
      const tbodyRect = tbody.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const tbodyOffsetInWrap = tbodyRect.top - wrapRect.top;
      const dayIdx = days.indexOf(todayStartTs);
      const leftFrac = dayIdx >= 0 ? (dayIdx + 1) / (days.length + 1) : null;

      setNowLine({ top: tbodyOffsetInWrap + tbodyRect.height * f, leftFrac });
    }

    compute();
    const interval = window.setInterval(compute, 60_000);
    window.addEventListener("resize", compute);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", compute);
    };
  }, [days, weekStartTs]);

  return (
    <div ref={wrapRef} className="relative">
      <table className="w-full table-fixed border-collapse text-[10px] sm:min-w-[640px] sm:text-xs">
        <colgroup>
          <col className="w-7 sm:w-14" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50">
            <th className="border-b border-gray-200 p-1 sm:p-2"></th>
            {days.map((dTs, i) => (
              <th
                key={dTs}
                className="border-b border-l border-gray-200 p-0.5 text-center font-medium text-gray-600 sm:p-2"
              >
                <div className="flex flex-col items-center leading-tight sm:flex-row sm:justify-center sm:gap-1">
                  <span className="text-gray-800">{DAYS[i]}</span>
                  <span className="text-gray-400">{new Date(dTs * 1000).getDate()}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map(({ hour, min }, rowIdx) => (
            <tr key={`${hour}:${min}`}>
              <td className="border-b border-gray-100 p-0.5 text-right align-top text-[9px] text-gray-400 sm:p-1 sm:text-[11px]">
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
                      onClick={() => onReservationClick?.(r)}
                      className={`h-5 max-w-0 overflow-hidden border-b border-l border-gray-100 sm:h-6 ${
                        onReservationClick ? "cursor-pointer" : ""
                      } ${TEAM_COLORS[r.team as Team] ?? "bg-slate-500"} text-white`}
                    >
                      {isStart ? (
                        <span className="block truncate px-0.5 text-[9px] leading-5 sm:px-1 sm:text-[11px] sm:leading-6">
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
                    className={`h-5 max-w-0 touch-none overflow-hidden border-b border-l border-gray-100 cursor-pointer select-none sm:h-6 ${
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

      {nowLine && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 h-[2px] bg-red-500"
            style={{ top: nowLine.top }}
          />
          {nowLine.leftFrac !== null && (
            <div
              className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
              style={{ top: nowLine.top, left: `${nowLine.leftFrac * 100}%` }}
            />
          )}
        </>
      )}
    </div>
  );
}
