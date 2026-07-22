import SessionButtons from "@/components/SessionButtons";
import HomeClient from "@/components/HomeClient";
import { listRooms, listReservations } from "@/lib/db/queries";
import { weekStart, dayColumns } from "@/lib/week";
import { getSessionUser } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const now = Math.floor(Date.now() / 1000);
  const ws = w ? Number(w) : weekStart(now);
  const weekEnd = dayColumns(ws)[6] + 24 * 3600;
  const rooms = listRooms();
  const reservations = listReservations(ws, weekEnd);
  const sessionUser = await getSessionUser();

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">동방 예약</h1>
        <div className="flex items-center gap-3">
          <a href="/my" className="text-sm text-blue-600">내 예약</a>
          {sessionUser?.isAdmin && <a href="/admin" className="text-sm text-blue-600">관리자</a>}
          <SessionButtons />
        </div>
      </header>
      <HomeClient rooms={rooms} reservations={reservations} weekStartTs={ws} />
    </main>
  );
}
