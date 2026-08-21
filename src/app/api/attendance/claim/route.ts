import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { claimMember, getMemberByStudentNo } from "@/lib/db/members";
import { SUB_TEAMS } from "@/lib/constants";

/** 학번으로 원장을 조회한다. 확인 화면에 이름·세부팀을 보여주기 위한 것. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const no = req.nextUrl.searchParams.get("studentNo") ?? "";
  const m = getMemberByStudentNo(no);
  if (!m) return NextResponse.json({ found: false });
  if (m.user_email) return NextResponse.json({ found: true, taken: true });
  return NextResponse.json({ found: true, taken: false, name: m.name, subTeam: m.sub_team });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const studentNo = String(body?.studentNo ?? "").trim();
  if (!/^\d{10}$/.test(studentNo)) {
    return NextResponse.json({ error: "학번 10자리를 입력해주세요." }, { status: 400 });
  }
  const subTeam = body?.subTeam;
  if (subTeam !== undefined && !SUB_TEAMS.includes(subTeam)) {
    return NextResponse.json({ error: "세부팀이 올바르지 않습니다." }, { status: 400 });
  }

  const r = claimMember({
    studentNo,
    email: user.email,
    name: body?.name ? String(body.name).trim() : undefined,
    subTeam,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, member: r.member });
}
