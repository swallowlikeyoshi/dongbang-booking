import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { deleteSession, restoreSession } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  }

  // 복구는 관리자만. 본인이 지운 것을 스스로 되살리면 삭제가 의미를 잃는다.
  if (body?.restore) {
    if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    const r = restoreSession({ sessionId, editorEmail: user.email });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const member = getMemberByEmail(user.email);
  const r = deleteSession({
    sessionId,
    actorEmail: user.email,
    isAdmin: user.isAdmin,
    actorMemberId: member?.id ?? null,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
