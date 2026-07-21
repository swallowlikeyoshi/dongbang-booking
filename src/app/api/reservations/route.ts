import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { listReservations, createReservation } from "@/lib/db/queries";
import { snapToSlot } from "@/lib/reservations";

export async function GET(req: NextRequest) {
  const start = Number(req.nextUrl.searchParams.get("start"));
  const end = Number(req.nextUrl.searchParams.get("end"));
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json({ error: "start/end 필요" }, { status: 400 });
  }
  return NextResponse.json({ reservations: listReservations(start, end) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const input = {
    room_id: Number(body.room_id),
    team: String(body.team),
    title: body.title ? String(body.title) : null,
    start_at: snapToSlot(Number(body.start_at)),
    end_at: snapToSlot(Number(body.end_at)),
    user_email: user.email,
    user_name: user.name,
  };

  const result = createReservation(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
