import { TEAM_COLORS, type Team } from "@/lib/constants";
import type { Reservation, Room } from "@/lib/db/queries";

export type RoomNext = {
  room: Room;
  next: Reservation | null;
};

function fmt(ts: number): string {
  const d = new Date(ts * 1000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}(${days[d.getDay()]}) ${hh}:${min}`;
}

export default function Dashboard({ items }: { items: RoomNext[] }) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="space-y-1.5">
        {items.map(({ room, next }) => (
          <div key={room.id} className="flex items-center gap-2 text-sm">
            {next && (
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  TEAM_COLORS[next.team as Team] ?? "bg-slate-500"
                }`}
              />
            )}
            <span className="font-medium text-gray-800">{room.name}</span>
            <span className="text-gray-400">다음 예약</span>
            {next ? (
              <span className="text-gray-600">
                · {fmt(next.start_at)} — {next.team}
                {next.title ? ` · ${next.title}` : ""}
              </span>
            ) : (
              <span className="text-gray-400">· 예약 없음</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
