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
 * 유일성은 `used_codes_member_slot_unique` DB 제약이 유일한 판정 근거다
 * (check-then-write는 TOCTOU 레이스에 취약하므로 사전 조회를 두지 않는다).
 * insert가 그 유일 제약을 위반하면 false를 반환하고, 그 외 에러(예: NOT NULL,
 * FOREIGN KEY, CHECK 위반)는 실제 오류이므로 그대로 다시 던진다.
 */
export function burnCode(memberId: number, slot: number, ts: number): boolean {
  try {
    db.insert(schema.usedCodes).values({ member_id: memberId, slot, used_at: ts }).run();
    return true;
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") return false;
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

export type SessionEdit = typeof schema.sessionEdits.$inferSelect;

/** 원본 시각을 덮어쓰지 않고 변경 이력을 별도 행으로 쌓는다. */
export function recordEdit(args: {
  sessionId: number; editorEmail: string; before: StudySession; after: StudySession; reason?: string;
}): void {
  db.insert(schema.sessionEdits).values({
    session_id: args.sessionId,
    editor_email: args.editorEmail,
    edited_at: Math.floor(Date.now() / 1000),
    before_json: JSON.stringify(args.before),
    after_json: JSON.stringify(args.after),
    reason: args.reason ?? null,
  }).run();
}

export function listEdits(sessionId: number): SessionEdit[] {
  return db.select().from(schema.sessionEdits)
    .where(eq(schema.sessionEdits.session_id, sessionId))
    .all();
}

export function getSession(id: number): StudySession | null {
  const rows = db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id)).all();
  return rows[0] ?? null;
}

/**
 * 종료 QR 없이 10시간을 넘긴 세션을 unresolved 로 마감한다.
 * 종료 시각은 시작 + 10시간으로 두되 집계에서는 빠지므로, 본인 신고 전까지 시간은 인정되지 않는다.
 * 정상적으로 QR 종료한 세션은 10시간을 넘겨도 이 함수의 대상이 아니다(status 가 이미 open 이 아님).
 */
export function autoCloseStale(now: number): number {
  const stale = listOpenSessions().filter((r) => now - r.started_at > MAX_OPEN_SECONDS);
  for (const row of stale) {
    const patch = { ended_at: row.started_at + MAX_OPEN_SECONDS, end_proof: null, status: "unresolved" };
    db.update(schema.studySessions)
      .set(patch)
      .where(eq(schema.studySessions.id, row.id))
      .run();
    recordEdit({
      sessionId: row.id,
      editorEmail: "system",
      before: row,
      after: { ...row, ...patch },
      reason: "10시간 초과 자동 마감",
    });
  }
  return stale.length;
}

/** unresolved 세션에 대해 본인이 종료 시각을 신고한다 → pending(승인 대기). */
export function reportEndTime(args: {
  sessionId: number; memberId: number; endedAt: number; editorEmail: string; note?: string;
}): CloseResult {
  const before = getSession(args.sessionId);
  if (!before) return { ok: false, error: "세션을 찾을 수 없습니다." };
  if (before.member_id !== args.memberId) return { ok: false, error: "본인 기록만 신고할 수 있습니다." };
  if (before.status !== "unresolved") return { ok: false, error: "미확정 상태의 기록만 신고할 수 있습니다." };
  if (args.endedAt <= before.started_at) return { ok: false, error: "종료 시각이 시작 시각보다 빠릅니다." };

  const after = { ...before, ended_at: args.endedAt, end_proof: "manual", status: "pending", note: args.note ?? null };
  db.update(schema.studySessions)
    .set({ ended_at: args.endedAt, end_proof: "manual", status: "pending", note: args.note ?? null })
    .where(eq(schema.studySessions.id, args.sessionId))
    .run();
  recordEdit({ sessionId: args.sessionId, editorEmail: args.editorEmail, before, after, reason: args.note });
  return { ok: true, session: after };
}

/** 관리자가 pending 세션을 승인/거부한다. */
export function reviewSession(args: {
  sessionId: number; approve: boolean; editorEmail: string; reason?: string;
}): CloseResult {
  const before = getSession(args.sessionId);
  if (!before) return { ok: false, error: "세션을 찾을 수 없습니다." };
  const reviewable = ["pending", "approved", "rejected"];
  if (!reviewable.includes(before.status)) {
    return { ok: false, error: "승인/거부할 수 없는 상태입니다." };
  }
  const status = args.approve ? "approved" : "rejected";
  const after = { ...before, status };
  db.update(schema.studySessions).set({ status }).where(eq(schema.studySessions.id, args.sessionId)).run();
  recordEdit({ sessionId: args.sessionId, editorEmail: args.editorEmail, before, after, reason: args.reason });
  return { ok: true, session: after };
}

export function listPendingReview(): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(eq(schema.studySessions.status, "pending"))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
}

export function listUnresolvedByMember(memberId: number): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.member_id, memberId), eq(schema.studySessions.status, "unresolved")))
    .all();
}
