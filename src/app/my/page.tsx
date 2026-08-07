import { getSessionUser } from "@/auth";
import { listReservationsByUser, listRooms, type Reservation } from "@/lib/db/queries";
import CancelButton from "@/components/CancelButton";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const user = await getSessionUser();
  if (!user) {
    return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">로그인이 필요합니다.</p></main>;
  }
  const rooms = listRooms();
  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? `방 ${id}`;
  const now = Math.floor(Date.now() / 1000);

  const all = listReservationsByUser(user.email);
  // 끝난 예약은 "지난"으로. 진행 중인 예약은 아직 향후 목록에 남긴다.
  const upcoming = all.filter((r) => r.end_at > now).sort((a, b) => a.start_at - b.start_at);
  const past = all.filter((r) => r.end_at <= now).sort((a, b) => b.start_at - a.start_at);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <a href="/" className="text-sm text-blue-600">← 홈</a>
      <h1 className="my-4 text-xl font-bold">내 예약</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          향후 예약 <span className="font-normal text-gray-400">{upcoming.length}건</span>
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">예정된 예약이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <ReservationRow key={r.id} r={r} roomName={roomName(r.room_id)} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            지난 예약 <span className="font-normal text-gray-400">{past.length}건</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {past.map((r) => (
              <ReservationRow key={r.id} r={r} roomName={roomName(r.room_id)} past />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

function ReservationRow({
  r, roomName, past = false,
}: {
  r: Reservation;
  roomName: string;
  past?: boolean;
}) {
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded border border-gray-200 p-2 text-sm ${
        past ? "bg-gray-50 text-gray-500" : "bg-white"
      }`}
    >
      <span>
        {r.series_id ? "⟳ " : ""}
        {roomName} · {r.team}{r.title ? ` · ${r.title}` : ""}
        <br />
        <span className="text-gray-500">{fmt(r.start_at)} ~ {fmt(r.end_at)}</span>
      </span>
      <CancelButton id={r.id} isRecurring={r.series_id !== null} />
    </li>
  );
}
