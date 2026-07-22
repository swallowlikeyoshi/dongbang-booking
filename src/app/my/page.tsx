import { getSessionUser } from "@/auth";
import { listReservationsByUser, listRooms } from "@/lib/db/queries";
import CancelButton from "@/components/CancelButton";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const user = await getSessionUser();
  if (!user) {
    return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">로그인이 필요합니다.</p></main>;
  }
  const rooms = listRooms();
  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? `방 ${id}`;
  const list = listReservationsByUser(user.email).sort((a, b) => a.start_at - b.start_at);
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <a href="/" className="text-sm text-blue-600">← 홈</a>
      <h1 className="my-4 text-xl font-bold">내 예약</h1>
      {list.length === 0 ? <p className="text-gray-500">예약이 없습니다.</p> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2 text-sm">
              <span>{roomName(r.room_id)} · {r.team}{r.title ? ` · ${r.title}` : ""}<br /><span className="text-gray-500">{fmt(r.start_at)} ~ {fmt(r.end_at)}</span></span>
              <CancelButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
