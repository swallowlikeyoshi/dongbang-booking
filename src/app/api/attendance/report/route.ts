import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { reportEndTime } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록 필요" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  const endedAt = Number(body?.endedAt);
  if (!Number.isFinite(sessionId) || !Number.isFinite(endedAt)) {
    return NextResponse.json({ error: "sessionId/endedAt 필요" }, { status: 400 });
  }

  const r = reportEndTime({
    sessionId,
    memberId: member.id,
    endedAt,
    editorEmail: user.email,
    note: typeof body?.note === "string" ? body.note : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
