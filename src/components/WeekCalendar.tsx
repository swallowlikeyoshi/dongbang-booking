"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SLOT_SECONDS, TEAM_COLORS, type Team } from "@/lib/constants";
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
          {/*
            가로 스크롤 컨테이너를 두면 thead 의 sticky 가 뷰포트가 아니라 그 컨테이너에
            붙어버려 아래로 스크롤할 때 요일 헤더가 따라오지 않는다. 표가 table-fixed 라
            좁은 화면에서도 넘치지 않으므로 컨테이너 없이 그대로 둔다.
          */}
          <div className="rounded-lg border border-gray-300">
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
  const [nowLine, setNowLine] = useState<{ top: number; leftPx: number | null } | null>(null);

  const todayStartTsForRender = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, []);

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

      const todayCell = tbody.querySelector<HTMLTableCellElement>('td[data-today="true"]');
      let leftPx: number | null = null;
      if (todayCell) {
        const cellRect = todayCell.getBoundingClientRect();
        leftPx = cellRect.left + cellRect.width / 2 - wrapRect.left;
      }

      setNowLine({ top: tbodyOffsetInWrap + tbodyRect.height * f, leftPx });
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
      {/* sticky thead 는 border-collapse 에서 테두리가 함께 따라오지 않는다. separate 사용. */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-[10px] sm:text-xs">
        <colgroup>
          <col className="w-7 sm:w-14" />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky top-0 z-20 border-b-2 border-gray-400 bg-gray-100 p-1 sm:p-2"></th>
            {days.map((dTs, i) => {
              const isToday = dTs === todayStartTsForRender;
              return (
                <th
                  key={dTs}
                  className={`sticky top-0 z-20 border-b-2 border-l border-gray-400 p-0.5 text-center font-medium sm:p-2 ${
                    isToday ? "bg-blue-50" : "bg-gray-100"
                  }`}
                >
                  <div className="flex flex-col items-center leading-tight sm:flex-row sm:justify-center sm:gap-1">
                    <span className={isToday ? "font-bold text-blue-700" : "text-gray-800"}>
                      {DAYS[i]}
                    </span>
                    <span className={isToday ? "text-blue-500" : "text-gray-500"}>
                      {new Date(dTs * 1000).getDate()}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map(({ hour, min }, rowIdx) => {
            // 정시 경계(30분 행의 아래쪽)를 진하게 그어 시간 단위를 눈에 띄게 한다.
            const rowBorder = min === 30 ? "border-b border-gray-400" : "border-b border-gray-200";
            return (
            <tr key={`${hour}:${min}`}>
              <td className={`${rowBorder} p-0.5 text-right align-top text-[9px] text-gray-500 sm:p-1 sm:text-[11px]`}>
                {min === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
              </td>
              {days.map((dTs) => {
                const r = resAt(room.id, dTs, hour, min);
                const slotTs = dTs + hour * 3600 + min * 60;
                const isStart = r && r.start_at === slotTs;
                const isEnd = r && r.end_at === slotTs + SLOT_SECONDS;
                const isSelected =
                  !r &&
                  drag !== null &&
                  drag.roomId === room.id &&
                  drag.dayTs === dTs &&
                  rowIdx >= Math.min(drag.anchorIdx, drag.currentIdx) &&
                  rowIdx <= Math.max(drag.anchorIdx, drag.currentIdx);

                const isToday = dTs === todayStartTsForRender;

                if (r) {
                  // 한 예약이 여러 슬롯에 걸치면 내부 가로선을 지워 하나의 블록으로 보이게 한다.
                  return (
                    <td
                      key={dTs}
                      data-today={isToday ? "true" : undefined}
                      onClick={() => onReservationClick?.(r)}
                      className={`h-5 max-w-0 overflow-hidden border-l border-gray-400 sm:h-6 ${
                        isEnd ? "border-b border-gray-400" : ""
                      } ${onReservationClick ? "cursor-pointer" : ""} ${
                        TEAM_COLORS[r.team as Team] ?? "bg-slate-500"
                      } text-white`}
                    >
                      {isStart ? (
                        <span className="block truncate px-0.5 text-[9px] leading-5 sm:px-1 sm:text-[11px] sm:leading-6">
                          {r.series_id ? "⟳ " : ""}
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
                    data-today={isToday ? "true" : undefined}
                    onPointerDown={(e) => beginDrag(e, room.id, dTs, rowIdx)}
                    onPointerEnter={() => extendDrag(room.id, dTs, rowIdx)}
                    className={`h-5 max-w-0 touch-none overflow-hidden border-l border-gray-400 ${rowBorder} cursor-pointer select-none sm:h-6 ${
                      isSelected ? "bg-blue-100" : isToday ? "bg-blue-50/40 hover:bg-blue-50" : "hover:bg-gray-100"
                    }`}
                  >
                    {""}
                  </td>
                );
              })}
            </tr>
          );
          })}
        </tbody>
      </table>

      {nowLine && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 h-[2px] bg-red-500"
            style={{ top: nowLine.top }}
          />
          {nowLine.leftPx !== null && (
            <div
              className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
              style={{ top: nowLine.top, left: nowLine.leftPx }}
            />
          )}
        </>
      )}
    </div>
  );
}
