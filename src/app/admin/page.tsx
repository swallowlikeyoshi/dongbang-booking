import { getSessionUser } from "@/auth";
import { listAllReservations, listRooms } from "@/lib/db/queries";
import CancelButton from "@/components/CancelButton";
import RoomRename from "@/components/RoomRename";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">로그인이 필요합니다.</p></main>;
  if (!user.isAdmin) return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">관리자만 접근할 수 있습니다.</p></main>;

  const rooms = listRooms();
  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? `방 ${id}`;
  const list = listAllReservations();
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-3xl p-4">
      <a href="/" className="text-sm text-blue-600">← 홈</a>
      <h1 className="my-4 text-xl font-bold">관리자</h1>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">방 이름</h2>
        <div className="space-y-2">
          {rooms.map((r) => <RoomRename key={r.id} id={r.id} name={r.name} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">전체 예약 ({list.length})</h2>
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{roomName(r.room_id)} · {r.team}{r.title ? ` · ${r.title}` : ""} · {r.user_name}<br /><span className="text-gray-500">{fmt(r.start_at)} ~ {fmt(r.end_at)}</span></span>
              <CancelButton id={r.id} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
