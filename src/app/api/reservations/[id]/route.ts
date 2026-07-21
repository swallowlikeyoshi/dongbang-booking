import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getReservation, deleteReservation } from "@/lib/db/queries";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { id } = await params;
  const reservation = getReservation(Number(id));
  if (!reservation) return NextResponse.json({ error: "없음" }, { status: 404 });

  const isOwner = reservation.user_email === user.email;
  if (!isOwner && !user.isAdmin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  deleteReservation(reservation.id);
  return new NextResponse(null, { status: 204 });
}
