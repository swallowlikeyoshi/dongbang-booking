import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { listRooms, renameRoom } from "@/lib/db/queries";

export async function GET() {
  return NextResponse.json({ rooms: listRooms() });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.name) return NextResponse.json({ error: "id/name 필요" }, { status: 400 });

  renameRoom(Number(body.id), String(body.name));
  return NextResponse.json({ ok: true });
}
