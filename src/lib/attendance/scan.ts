import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";
import { burnCode, closeSession, currentSession, openSession, type StudySession } from "./sessions";

export const PENDING_TTL_SECONDS = 600;

export type PendingScan = typeof schema.pendingScans.$inferSelect;

export type ScanOutcome =
  | { kind: "checked_in"; session: StudySession }
  | { kind: "checked_out"; session: StudySession }
  | { kind: "error"; error: string };

/**
 * 로그인 전 스캔을 보관한다. 재실 증명 시각은 이 시점으로 고정된다.
 *
 * 인증 이전에 호출되므로(코드만 있으면 누구나 행을 만들 수 있음) 매 호출마다
 * TTL을 넘긴 오래된 행을 함께 청소한다. 이 테이블은 대회방 Jetson에서 24/7
 * 돌아가는 SQLite 파일이라 별도 cron 없이 자체적으로 크기가 유지되어야 한다.
 */
export function createPendingScan(match: { roomId: number; slot: number }, ts: number): string {
  db.delete(schema.pendingScans).where(lt(schema.pendingScans.scanned_at, ts - PENDING_TTL_SECONDS)).run();

  const id = randomUUID();
  db.insert(schema.pendingScans).values({
    id, room_id: match.roomId, slot: match.slot, scanned_at: ts, consumed_at: null,
  }).run();
  return id;
}

/**
 * pending scan을 조회만 한다 (소비하지 않음). 존재하고, 아직 소비되지 않았고,
 * TTL 이내면 행을 반환한다. 실제 소비는 `markPendingConsumed`가 담당한다 —
 * 그래야 `applyScan`이 실패했을 때(예: 다른 탭에서 이미 같은 슬롯을 소각) 이
 * pending을 잃지 않고 재시도할 수 있다.
 */
export function consumePendingScan(id: string, ts: number): PendingScan | null {
  const rows = db.select().from(schema.pendingScans)
    .where(and(eq(schema.pendingScans.id, id), isNull(schema.pendingScans.consumed_at)))
    .all();
  const row = rows[0];
  if (!row) return null;
  if (ts - row.scanned_at > PENDING_TTL_SECONDS) return null;
  return row;
}

/** pending scan을 실제로 소비 처리한다. 성공적으로 적용된 뒤에만 호출해야 한다. */
export function markPendingConsumed(id: string, ts: number): void {
  db.update(schema.pendingScans).set({ consumed_at: ts }).where(eq(schema.pendingScans.id, id)).run();
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
