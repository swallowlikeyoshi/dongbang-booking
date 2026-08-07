import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getReservation, deleteReservation, deleteSeriesFrom } from "@/lib/db/queries";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { id } = await params;
  const reservation = getReservation(Number(id));
  if (!reservation) return NextResponse.json({ error: "없음" }, { status: 404 });

  const isOwner = reservation.user_email === user.email;
  if (!isOwner && !user.isAdmin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // ?scope=series → 이 회차부터 뒤로 전부. 기본값은 이 회차만.
  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "series" && reservation.series_id) {
    const deleted = deleteSeriesFrom(reservation.series_id, reservation.start_at);
    return NextResponse.json({ deleted }, { status: 200 });
  }

  deleteReservation(reservation.id);
  return new NextResponse(null, { status: 204 });
}
