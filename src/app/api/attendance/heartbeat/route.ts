import { NextRequest, NextResponse } from "next/server";
import { loadDevices, verifyCode } from "@/lib/attendance/code";
import { occupancy, recordHeartbeat } from "@/lib/attendance/devices";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "");
  const now = Math.floor(Date.now() / 1000);

  const match = verifyCode(code, now, loadDevices());
  if (!match) return NextResponse.json({ error: "invalid code" }, { status: 401 });

  recordHeartbeat(match.roomId, now, body?.firmware ? String(body.firmware) : undefined);
  return NextResponse.json({ ok: true, occupancy: occupancy(match.roomId), serverTime: now });
}
