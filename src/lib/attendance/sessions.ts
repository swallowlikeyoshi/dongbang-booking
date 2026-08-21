import { and, eq, desc, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";

export type StudySession = typeof schema.studySessions.$inferSelect;

/** 누적 시간 집계에 포함되는 상태. */
export const COUNTED_STATUSES = ["confirmed", "pending", "approved"] as const;

/** 종료 없이 이 시간을 넘기면 자동 마감된다. */
export const MAX_OPEN_SECONDS = 10 * 3600;

export type OpenResult = { ok: true; session: StudySession } | { ok: false; error: string };
export type CloseResult = { ok: true; session: StudySession } | { ok: false; error: string };

export function currentSession(memberId: number): StudySession | null {
  const rows = db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.member_id, memberId), eq(schema.studySessions.status, "open")))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
  return rows[0] ?? null;
}

export function listSessionsByMember(memberId: number): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(eq(schema.studySessions.member_id, memberId))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
}

/**
 * (슬롯, 멤버) 쌍 소각. 이미 쓴 조합이면 false.
 *
 * 사전 조회는 일반 경로의 예외 비용을 피하기 위한 것일 뿐, 실제 유일성은
 * `used_codes_member_slot_unique` DB 제약이 보장한다(check-then-write는
 * TOCTOU 레이스에 취약하므로 단독으로 신뢰하지 않는다). insert가 그
 * 제약을 위반하면 false를 반환하고, 그 외 에러는 그대로 다시 던진다.
 */
export function burnCode(memberId: number, slot: number, ts: number): boolean {
  const dup = db.select().from(schema.usedCodes)
    .where(and(eq(schema.usedCodes.member_id, memberId), eq(schema.usedCodes.slot, slot)))
    .all();
  if (dup.length > 0) return false;
  try {
    db.insert(schema.usedCodes).values({ member_id: memberId, slot, used_at: ts }).run();
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) return false;
    throw err;
  }
}

export function openSession(args: {
  memberId: number; roomId: number; ts: number; slot: number;
}): OpenResult {
  if (currentSession(args.memberId)) {
    return { ok: false, error: "이미 진행 중인 스터디가 있습니다. 먼저 종료해주세요." };
  }
  const row = db.insert(schema.studySessions).values({
    member_id: args.memberId,
    room_id: args.roomId,
    started_at: args.ts,
    ended_at: null,
    start_proof: "qr",
    end_proof: null,
    status: "open",
    created_at: args.ts,
  }).returning().all()[0];
  return { ok: true, session: row };
}

export function closeSession(args: {
  memberId: number; ts: number; proof: "qr" | "manual"; note?: string;
  lat?: number; lng?: number;
}): CloseResult {
  const open = currentSession(args.memberId);
  if (!open) return { ok: false, error: "진행 중인 스터디가 없습니다." };
  if (args.ts <= open.started_at) return { ok: false, error: "종료 시각이 시작 시각보다 빠릅니다." };

  const status = args.proof === "qr" ? "confirmed" : "pending";
  const patch = {
    ended_at: args.ts,
    end_proof: args.proof,
    status,
    note: args.note ?? null,
    report_lat: args.lat ?? null,
    report_lng: args.lng ?? null,
  };
  db.update(schema.studySessions).set(patch).where(eq(schema.studySessions.id, open.id)).run();
  return { ok: true, session: { ...open, ...patch } };
}

export function listOpenSessions(): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.status, "open"), isNull(schema.studySessions.ended_at)))
    .all();
}
