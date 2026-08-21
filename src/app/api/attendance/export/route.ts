import { NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { memberTotals } from "@/lib/attendance/aggregate";
import { getWeeklyCapSeconds } from "@/lib/attendance/settings";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const cap = getWeeklyCapSeconds();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);
  const lines = ["이름,세부팀,작업시간(hr),상한전(hr),세션수,보정건수"];
  for (const r of rows) {
    lines.push([
      r.member.name,
      r.member.sub_team,
      (r.countedSeconds / 3600).toFixed(1),
      (r.rawSeconds / 3600).toFixed(1),
      String(r.sessionCount),
      String(r.adjustedCount),
    ].join(","));
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="study-hours.csv"',
    },
  });
}
