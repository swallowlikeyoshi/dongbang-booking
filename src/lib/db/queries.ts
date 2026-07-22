import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "./index";
import { validateReservation, type NewReservationInput } from "@/lib/reservations";

export type Room = typeof schema.rooms.$inferSelect;
export type Reservation = typeof schema.reservations.$inferSelect;

export function listRooms(): Room[] {
  return db.select().from(schema.rooms).all();
}

export function renameRoom(id: number, name: string): void {
  db.update(schema.rooms).set({ name }).where(eq(schema.rooms.id, id)).run();
}

export function listReservations(rangeStart: number, rangeEnd: number): Reservation[] {
  return db
    .select()
    .from(schema.reservations)
    .where(and(lt(schema.reservations.start_at, rangeEnd), gt(schema.reservations.end_at, rangeStart)))
    .all();
}

export function listReservationsByUser(email: string): Reservation[] {
  return db.select().from(schema.reservations).where(eq(schema.reservations.user_email, email)).all();
}

export function listAllReservations(): Reservation[] {
  return db.select().from(schema.reservations).orderBy(schema.reservations.start_at).all();
}

export function getReservation(id: number): Reservation | null {
  const rows = db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).all();
  return rows[0] ?? null;
}

export function deleteReservation(id: number): void {
  db.delete(schema.reservations).where(eq(schema.reservations.id, id)).run();
}

export function createReservation(
  input: NewReservationInput & { user_email: string; user_name: string },
): { ok: true; id: number } | { ok: false; error: string } {
  // 같은 방의 겹칠 수 있는 예약만 읽어 검증
  const candidates = db
    .select({ room_id: schema.reservations.room_id, start_at: schema.reservations.start_at, end_at: schema.reservations.end_at })
    .from(schema.reservations)
    .where(eq(schema.reservations.room_id, input.room_id))
    .all();

  const check = validateReservation(input, candidates);
  if (!check.ok) return check;

  const res = db
    .insert(schema.reservations)
    .values({
      room_id: input.room_id,
      team: input.team,
      title: input.title,
      user_email: input.user_email,
      user_name: input.user_name,
      start_at: input.start_at,
      end_at: input.end_at,
      created_at: Math.floor(Date.now() / 1000),
    })
    .run();
  return { ok: true, id: Number(res.lastInsertRowid) };
}
