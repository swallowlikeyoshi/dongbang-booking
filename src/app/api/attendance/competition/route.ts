import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { setCompetition } from "@/lib/db/members";
import { COMPETITIONS, type Competition } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const memberId = Number(body?.memberId);
  if (!Number.isFinite(memberId)) {
    return NextResponse.json({ error: "memberId 필요" }, { status: 400 });
  }

  const raw = body?.competition;
  // 빈 문자열은 "미배정으로 되돌림" 을 뜻한다.
  const competition: Competition | null =
    raw === "" || raw === null || raw === undefined ? null : raw;
  if (competition !== null && !COMPETITIONS.includes(competition)) {
    return NextResponse.json({ error: "참여 대회가 올바르지 않습니다." }, { status: 400 });
  }

  const r = setCompetition(memberId, competition);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
