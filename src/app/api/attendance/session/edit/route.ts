import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { editSessionTimes } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  const startedAt = Number(body?.startedAt);
  const endedAt = Number(body?.endedAt);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  }

  const r = editSessionTimes({
    sessionId, startedAt, endedAt,
    editorEmail: user.email,
    now: Math.floor(Date.now() / 1000),
    reason: typeof body?.reason === "string" ? body.reason : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
