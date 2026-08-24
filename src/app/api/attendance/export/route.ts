import { NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { memberTotals } from "@/lib/attendance/aggregate";

import { escapeCsvCell } from "@/lib/attendance/csv";

function csvRow(cells: string[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const rows = memberTotals();
  const lines = [csvRow(["이름", "세부팀", "작업시간(hr)", "상한전(hr)", "세션수", "보정건수"])];
  for (const r of rows) {
    lines.push(csvRow([
      r.member.name,
      r.member.sub_team,
      (r.countedSeconds / 3600).toFixed(1),
      (r.rawSeconds / 3600).toFixed(1),
      String(r.sessionCount),
      String(r.adjustedCount),
    ]));
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="study-hours.csv"',
    },
  });
}
