import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { createSessionManually } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 100) : undefined;

  const r = createSessionManually({
    memberId: Number(body?.memberId),
    roomId: Number(body?.roomId),
    startedAt: Number(body?.startedAt),
    endedAt: Number(body?.endedAt),
    editorEmail: user.email,
    now: Math.floor(Date.now() / 1000),
    note: note || undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, session: r.session });
}
