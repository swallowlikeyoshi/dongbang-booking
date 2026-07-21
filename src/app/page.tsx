import SessionButtons from "@/components/SessionButtons";
import WeekCalendar from "@/components/WeekCalendar";
import { listRooms, listReservations } from "@/lib/db/queries";
import { weekStart, dayColumns } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = Math.floor(Date.now() / 1000);
  const ws = weekStart(now);
  const weekEnd = dayColumns(ws)[6] + 24 * 3600;
  const rooms = listRooms();
  const reservations = listReservations(ws, weekEnd);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">동방 예약</h1>
        <div className="flex items-center gap-3">
          <a href="/my" className="text-sm text-blue-600">내 예약</a>
          <SessionButtons />
        </div>
      </header>
      <WeekCalendar rooms={rooms} reservations={reservations} weekStartTs={ws} />
    </main>
  );
}
