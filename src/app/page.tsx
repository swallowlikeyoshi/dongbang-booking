import SessionButtons from "@/components/SessionButtons";
import HomeClient from "@/components/HomeClient";
import Dashboard from "@/components/Dashboard";
import { listRooms, listReservations, nextReservation, currentReservation } from "@/lib/db/queries";
import { weekStart, dayColumns } from "@/lib/week";
import { getSessionUser } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const now = Math.floor(Date.now() / 1000);
  const parsed = w ? Number(w) : NaN;
  const ws = Number.isFinite(parsed) ? parsed : weekStart(now);
  const weekEnd = dayColumns(ws)[6] + 24 * 3600;
  const rooms = listRooms();
  const reservations = listReservations(ws, weekEnd);
  const sessionUser = await getSessionUser();
  const dashboardItems = rooms.map((room) => ({
    room,
    current: currentReservation(room.id, now),
    next: nextReservation(room.id, now),
  }));

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-base font-bold sm:text-xl">HEVEN 동아리방 예약 시트</h1>
        <div className="flex items-center gap-3">
          <a href="/my" className="text-sm text-blue-600">내 예약</a>
          {sessionUser?.isAdmin && <a href="/admin" className="text-sm text-blue-600">관리자</a>}
          <a
            href="https://github.com/swallowlikeyoshi/dongbang-booking"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub 저장소"
            title="GitHub 저장소"
            className="text-gray-500 transition-colors hover:text-gray-900"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-5 w-5 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <SessionButtons />
        </div>
      </header>
      <Dashboard items={dashboardItems} />
      <HomeClient
        rooms={rooms}
        reservations={reservations}
        weekStartTs={ws}
        sessionEmail={sessionUser?.email ?? null}
        isAdmin={sessionUser?.isAdmin ?? false}
      />
    </main>
  );
}
