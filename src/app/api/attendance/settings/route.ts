import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getSetting, setSetting } from "@/lib/attendance/settings";
import { validateSettingInput } from "@/lib/attendance/settings-validation";

export async function GET() {
  return NextResponse.json({
    weekly_cap_hours: getSetting("weekly_cap_hours"),
    entry_quota: getSetting("entry_quota"),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const r = validateSettingInput(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  setSetting(r.key, r.value);
  return NextResponse.json({ ok: true });
}
