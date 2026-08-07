import { and, eq, gt, gte, lt, lte } from "drizzle-orm";
import { db, schema } from "./index";
import { expandWeekly, validateReservation, type NewReservationInput } from "@/lib/reservations";

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

export function nextReservation(roomId: number, afterTs: number): Reservation | null {
  const rows = db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.room_id, roomId), gte(schema.reservations.start_at, afterTs)))
    .orderBy(schema.reservations.start_at)
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export function currentReservation(roomId: number, ts: number): Reservation | null {
  const rows = db
    .select()
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.room_id, roomId),
        lte(schema.reservations.start_at, ts),
        gt(schema.reservations.end_at, ts),
      ),
    )
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export function getReservation(id: number): Reservation | null {
  const rows = db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).all();
  return rows[0] ?? null;
}

export function deleteReservation(id: number): void {
  db.delete(schema.reservations).where(eq(schema.reservations.id, id)).run();
}

/**
 * 반복 예약에서 기준 회차와 그 이후 회차를 모두 지운다("앞으로 모든 일정 취소").
 * 이미 지나간 회차는 기록으로 남긴다. 지운 개수를 돌려준다.
 */
export function deleteSeriesFrom(seriesId: string, fromTs: number): number {
  const targets = db
    .select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(and(eq(schema.reservations.series_id, seriesId), gte(schema.reservations.start_at, fromTs)))
    .all();
  db.delete(schema.reservations)
    .where(and(eq(schema.reservations.series_id, seriesId), gte(schema.reservations.start_at, fromTs)))
    .run();
  return targets.length;
}

/** 기준 회차 이후로 남아 있는 같은 시리즈 예약 수(자기 자신 포함). */
export function countSeriesFrom(seriesId: string, fromTs: number): number {
  return db
    .select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(and(eq(schema.reservations.series_id, seriesId), gte(schema.reservations.start_at, fromTs)))
    .all().length;
}

/**
 * 예약을 만든다. `repeatWeeks > 1`이면 매주 같은 시간으로 그만큼 회차를 만들고
 * 하나의 series_id 로 묶는다.
 *
 * 첫 회차가 겹치면 전체를 거절하지만, 이후 회차가 이미 찬 주는 건너뛰고 나머지를
 * 만든다 — 한 주 겹쳤다고 학기 전체 예약을 포기시키는 편이 더 불편하다.
 * 건너뛴 회차의 시작 시각은 `skipped` 로 돌려준다.
 */
export function createReservation(
  input: NewReservationInput & { user_email: string; user_name: string },
  repeatWeeks = 1,
): { ok: true; id: number; created: number; skipped: number[] } | { ok: false; error: string } {
  const room = db.select().from(schema.rooms).where(eq(schema.rooms.id, input.room_id)).all();
  if (room.length === 0) return { ok: false, error: "존재하지 않는 방입니다." };

  // 같은 방의 겹칠 수 있는 예약만 읽어 검증
  const candidates = db
    .select({ room_id: schema.reservations.room_id, start_at: schema.reservations.start_at, end_at: schema.reservations.end_at })
    .from(schema.reservations)
    .where(eq(schema.reservations.room_id, input.room_id))
    .all();

  const occurrences = expandWeekly(input, repeatWeeks);
  const first = validateReservation(occurrences[0], candidates);
  if (!first.ok) return first;

  const seriesId = repeatWeeks > 1 ? crypto.randomUUID() : null;
  const now = Math.floor(Date.now() / 1000);
  const skipped: number[] = [];
  let firstId = 0;
  let created = 0;

  db.transaction((tx) => {
    for (const occ of occurrences) {
      // 만든 회차를 후보에 계속 더해야 같은 시리즈 안에서의 자기 충돌도 잡힌다.
      if (!validateReservation(occ, candidates).ok) {
        skipped.push(occ.start_at);
        continue;
      }
      const res = tx
        .insert(schema.reservations)
        .values({
          room_id: occ.room_id,
          team: occ.team,
          title: occ.title,
          user_email: input.user_email,
          user_name: input.user_name,
          start_at: occ.start_at,
          end_at: occ.end_at,
          created_at: now,
          series_id: seriesId,
        })
        .run();
      candidates.push({ room_id: occ.room_id, start_at: occ.start_at, end_at: occ.end_at });
      if (created === 0) firstId = Number(res.lastInsertRowid);
      created++;
    }
  });

  return { ok: true, id: firstId, created, skipped };
}
