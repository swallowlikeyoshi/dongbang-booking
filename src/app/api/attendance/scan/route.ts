import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { applyScan, consumePendingScan } from "@/lib/attendance/scan";
import { autoCloseStale } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록이 필요합니다" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const pendingId = body?.pendingId;
  if (typeof pendingId !== "string") return NextResponse.json({ error: "pendingId 필요" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  autoCloseStale(now);

  const pending = consumePendingScan(pendingId, now);
  if (!pending) return NextResponse.json({ error: "스캔이 만료되었습니다. QR을 다시 스캔해주세요." }, { status: 410 });

  const outcome = applyScan({
    memberId: member.id,
    roomId: pending.room_id,
    slot: pending.slot,
    ts: pending.scanned_at,
  });
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: 400 });
  return NextResponse.json({ kind: outcome.kind, session: outcome.session });
}
