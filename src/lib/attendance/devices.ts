import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";
import { loadDevices } from "./code";
import { listOpenSessions } from "./sessions";

/** 장비는 5분마다 하트비트를 보낸다. 두 번 연속 놓치면 오프라인으로 본다. */
export const OFFLINE_AFTER_SECONDS = 15 * 60;

export type DeviceStatus = {
  roomId: number;
  online: boolean;
  lastSeenAt: number | null;
  firmware: string | null;
  occupancy: number;
};

export function recordHeartbeat(roomId: number, ts: number, firmware?: string): void {
  const rows = db.select().from(schema.deviceHeartbeats)
    .where(eq(schema.deviceHeartbeats.room_id, roomId)).all();
  if (rows.length === 0) {
    db.insert(schema.deviceHeartbeats)
      .values({ room_id: roomId, last_seen_at: ts, firmware: firmware ?? null }).run();
  } else {
    db.update(schema.deviceHeartbeats)
      .set({ last_seen_at: ts, firmware: firmware ?? rows[0].firmware })
      .where(eq(schema.deviceHeartbeats.room_id, roomId)).run();
  }
}

export function occupancy(roomId: number): number {
  return listOpenSessions().filter((s) => s.room_id === roomId).length;
}

export function deviceStatuses(now: number): DeviceStatus[] {
  const beats = new Map(
    db.select().from(schema.deviceHeartbeats).all().map((b) => [b.room_id, b]),
  );
  return loadDevices().map((d) => {
    const b = beats.get(d.roomId);
    return {
      roomId: d.roomId,
      online: b ? now - b.last_seen_at <= OFFLINE_AFTER_SECONDS : false,
      lastSeenAt: b?.last_seen_at ?? null,
      firmware: b?.firmware ?? null,
      occupancy: occupancy(d.roomId),
    };
  });
}
