import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";
import { burnCode, closeSession, currentSession, openSession, type StudySession } from "./sessions";

export const PENDING_TTL_SECONDS = 600;

export type PendingScan = typeof schema.pendingScans.$inferSelect;

export type ScanOutcome =
  | { kind: "checked_in"; session: StudySession }
  | { kind: "checked_out"; session: StudySession }
  | { kind: "error"; error: string };

/** 로그인 전 스캔을 보관한다. 재실 증명 시각은 이 시점으로 고정된다. */
export function createPendingScan(match: { roomId: number; slot: number }, ts: number): string {
  const id = randomUUID();
  db.insert(schema.pendingScans).values({
    id, room_id: match.roomId, slot: match.slot, scanned_at: ts, consumed_at: null,
  }).run();
  return id;
}

export function consumePendingScan(id: string, ts: number): PendingScan | null {
  const rows = db.select().from(schema.pendingScans)
    .where(and(eq(schema.pendingScans.id, id), isNull(schema.pendingScans.consumed_at)))
    .all();
  const row = rows[0];
  if (!row) return null;
  if (ts - row.scanned_at > PENDING_TTL_SECONDS) return null;
  db.update(schema.pendingScans).set({ consumed_at: ts }).where(eq(schema.pendingScans.id, id)).run();
  return row;
}

/** 진행 중인 세션이 없으면 체크인, 있으면 체크아웃. 코드는 (슬롯, 멤버) 단위로 소각된다. */
export function applyScan(args: {
  memberId: number; roomId: number; slot: number; ts: number;
}): ScanOutcome {
  if (!burnCode(args.memberId, args.slot, args.ts)) {
    return { kind: "error", error: "이미 사용한 코드입니다. 화면의 새 QR을 다시 스캔해주세요." };
  }
  const open = currentSession(args.memberId);
  if (!open) {
    const r = openSession({ memberId: args.memberId, roomId: args.roomId, ts: args.ts, slot: args.slot });
    return r.ok ? { kind: "checked_in", session: r.session } : { kind: "error", error: r.error };
  }
  const r = closeSession({ memberId: args.memberId, ts: args.ts, proof: "qr" });
  return r.ok ? { kind: "checked_out", session: r.session } : { kind: "error", error: r.error };
}
