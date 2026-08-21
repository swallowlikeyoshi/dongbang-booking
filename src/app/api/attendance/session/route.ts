import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { autoCloseStale, closeSession, currentSession } from "@/lib/attendance/sessions";
import { resolveRoomName } from "@/lib/attendance/room-name";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ session: null });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ session: null });

  autoCloseStale(Math.floor(Date.now() / 1000));
  const session = currentSession(member.id);
  const roomName = session ? resolveRoomName(session.room_id) : undefined;
  return NextResponse.json({ session, memberName: member.name, roomName });
}

/** QR 없는 수동 종료 = 보정 신고. pending 상태로 들어가 관리자 승인을 기다린다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록 필요" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note : undefined;
  const lat = Number.isFinite(Number(body?.lat)) ? Number(body.lat) : undefined;
  const lng = Number.isFinite(Number(body?.lng)) ? Number(body.lng) : undefined;
  const r = closeSession({
    memberId: member.id, ts: Math.floor(Date.now() / 1000), proof: "manual", note, lat, lng,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, session: r.session });
}
