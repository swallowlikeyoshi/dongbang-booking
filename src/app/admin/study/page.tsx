import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { listPendingReview } from "@/lib/attendance/sessions";
import { listMembers } from "@/lib/db/members";
import { deviceStatuses } from "@/lib/attendance/devices";
import { getSetting } from "@/lib/attendance/settings";
import ReviewButtons from "@/components/attendance/ReviewButtons";
import SettingsForm from "@/components/attendance/SettingsForm";
import UnbindButton from "@/components/attendance/UnbindButton";

export const dynamic = "force-dynamic";

function fmt(ts: number | null) {
  if (ts === null) return "—";
  return new Date(ts * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminStudyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/admin/study");
  if (!user.isAdmin) redirect("/");

  const now = Math.floor(Date.now() / 1000);
  const pending = listPendingReview();
  const allMembers = listMembers();
  const members = new Map(allMembers.map((m) => [m.id, m]));
  const boundMembers = allMembers.filter((m) => m.user_email);
  const devices = deviceStatuses(now);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">스터디 시간 관리</h1>

      <h2 className="mt-8 mb-2 text-lg">장비 상태</h2>
      <ul className="divide-y">
        {devices.map((d) => (
          <li key={d.roomId} className="flex items-center gap-3 py-2">
            <span className={d.online ? "text-emerald-700" : "text-red-700"}>{d.online ? "온라인" : "오프라인"}</span>
            <span>{d.roomId}번 방</span>
            <span className="text-slate-500">최종 수신 {fmt(d.lastSeenAt)}</span>
            <span className="ml-auto text-slate-600">재실 {d.occupancy}명</span>
          </li>
        ))}
        {devices.length === 0 && <li className="py-2 text-slate-500">ATTENDANCE_DEVICE_SECRETS 가 설정되지 않았습니다.</li>}
      </ul>

      <h2 className="mt-8 mb-2 text-lg">승인 대기 {pending.length}건</h2>
      <ul className="divide-y">
        {pending.map((s) => {
          // 이 태그는 "지금 이 순간" 장비가 오프라인인지만 보여준다. 세션 당시
          // 장비 상태는 하트비트 이력을 저장하지 않아 알 수 없다 — 과거 상태를
          // 이 값으로 추론하지 말 것.
          const offlineTag = devices.find((d) => d.roomId === s.room_id && !d.online);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {members.get(s.member_id)?.name ?? `#${s.member_id}`} · {fmt(s.started_at)} – {fmt(s.ended_at)}
                {s.note ? ` · ${s.note}` : ""}
                {offlineTag && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">장비 현재 오프라인</span>}
                {s.report_lat !== null && s.report_lng !== null && (
                  <a
                    className="ml-2 text-xs underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps?q=${s.report_lat},${s.report_lng}`}
                  >
                    위치
                  </a>
                )}
              </span>
              <ReviewButtons sessionId={s.id} />
            </li>
          );
        })}
        {pending.length === 0 && <li className="py-2 text-slate-500">없습니다.</li>}
      </ul>

      <h2 className="mt-8 mb-2 text-lg">계정 연결 {boundMembers.length}건</h2>
      <p className="mb-2 text-sm text-slate-500">
        학번을 잘못 클레임한 경우(오클릭·오입력·타인의 학번 도용 등) 여기서 연결을 해제한다.
        학번의 누적 시간은 유지되며, 이후 다른 계정이 그 학번을 다시 클레임할 수 있다.
      </p>
      <ul className="divide-y">
        {boundMembers.map((mem) => (
          <li key={mem.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="flex-1">
              {mem.name} · {mem.sub_team} · <span className="text-slate-500">{mem.user_email}</span>
            </span>
            <UnbindButton memberId={mem.id} name={mem.name} />
          </li>
        ))}
        {boundMembers.length === 0 && <li className="py-2 text-slate-500">없습니다.</li>}
      </ul>

      <h2 className="mt-8 mb-2 text-lg">설정</h2>
      <SettingsForm
        initial={{
          weekly_cap_hours: getSetting("weekly_cap_hours") ?? "",
          entry_quota: getSetting("entry_quota") ?? "",
        }}
      />

      <h2 className="mt-8 mb-2 text-lg">내보내기</h2>
      <a className="underline" href="/api/attendance/export">누적 시간 CSV 다운로드</a>
    </main>
  );
}
