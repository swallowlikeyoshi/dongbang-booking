import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const s = await import("./sessions");
const a = await import("./aggregate");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;
const NOW = T0 + 100 * 3600;

function addSession(memberId: number, start: number, end: number | null, status: string, endProof: string | null = "qr") {
  return db.insert(schema.studySessions).values({
    member_id: memberId, room_id: 1, started_at: start, ended_at: end,
    start_proof: "qr", end_proof: endProof, status, created_at: start,
  }).returning().all()[0];
}

describe("삭제 · 복구 · 시각 수정", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.sessionEdits).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0 },
      { id: 2, student_no: "2", name: "나", sub_team: "계기 및 데이터", created_at: 0 },
    ]).run();
  });

  test("본인 기록을 삭제하면 집계에서 빠진다", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    expect(a.memberTotals().find((r) => r.member.id === 1)!.countedSeconds).toBe(3600);
    const r = s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 });
    expect(r.ok).toBe(true);
    expect(a.memberTotals().find((r2) => r2.member.id === 1)!.countedSeconds).toBe(0);
  });

  test("삭제해도 행과 이력은 남는다", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 });
    expect(s.getSession(row.id)).not.toBeNull();
    const edits = s.listEdits(row.id);
    expect(edits).toHaveLength(1);
    expect(edits[0].editor_email).toBe("a@b.com");
    expect(JSON.parse(edits[0].before_json).status).toBe("confirmed");
    expect(JSON.parse(edits[0].after_json).status).toBe("deleted");
  });

  test("남의 기록은 삭제할 수 없다", () => {
    const row = addSession(2, T0, T0 + 3600, "confirmed");
    const r = s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 });
    expect(r.ok).toBe(false);
    expect(s.getSession(row.id)!.status).toBe("confirmed");
  });

  test("관리자는 남의 기록도 삭제할 수 있다", () => {
    const row = addSession(2, T0, T0 + 3600, "confirmed");
    expect(s.deleteSession({ sessionId: row.id, actorEmail: "admin@b.com", isAdmin: true, actorMemberId: null }).ok).toBe(true);
  });

  test("이미 삭제된 기록은 다시 삭제할 수 없다", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 });
    expect(s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 }).ok).toBe(false);
  });

  test("복구하면 종료 증명에 맞는 상태로 돌아간다", () => {
    const qr = addSession(1, T0, T0 + 3600, "confirmed", "qr");
    const manual = addSession(1, T0 + 7200, T0 + 10800, "pending", "manual");
    for (const row of [qr, manual]) {
      s.deleteSession({ sessionId: row.id, actorEmail: "a@b.com", isAdmin: false, actorMemberId: 1 });
    }
    expect(s.restoreSession({ sessionId: qr.id, editorEmail: "admin@b.com" }).ok).toBe(true);
    expect(s.getSession(qr.id)!.status).toBe("confirmed");
    s.restoreSession({ sessionId: manual.id, editorEmail: "admin@b.com" });
    expect(s.getSession(manual.id)!.status).toBe("pending");
  });

  test("삭제되지 않은 기록은 복구 대상이 아니다", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    expect(s.restoreSession({ sessionId: row.id, editorEmail: "admin@b.com" }).ok).toBe(false);
  });

  test("시각 수정이 집계에 반영되고 이력이 남는다", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    const r = s.editSessionTimes({
      sessionId: row.id, startedAt: T0, endedAt: T0 + 7200,
      editorEmail: "admin@b.com", now: NOW,
    });
    expect(r.ok).toBe(true);
    expect(a.memberTotals().find((x) => x.member.id === 1)!.countedSeconds).toBe(7200);
    expect(JSON.parse(s.listEdits(row.id)[0].before_json).ended_at).toBe(T0 + 3600);
  });

  test("역전·미래·24시간 초과는 거절", () => {
    const row = addSession(1, T0, T0 + 3600, "confirmed");
    const base = { sessionId: row.id, editorEmail: "admin@b.com", now: NOW };
    expect(s.editSessionTimes({ ...base, startedAt: T0 + 100, endedAt: T0 }).ok).toBe(false);
    expect(s.editSessionTimes({ ...base, startedAt: T0, endedAt: NOW + 3600 }).ok).toBe(false);
    expect(s.editSessionTimes({ ...base, startedAt: T0, endedAt: T0 + 25 * 3600 }).ok).toBe(false);
    // 거절되었으므로 원본이 그대로여야 한다.
    expect(s.getSession(row.id)!.ended_at).toBe(T0 + 3600);
  });
});

describe("관리자 수동 추가", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.sessionEdits).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.delete(schema.rooms).run();
    db.insert(schema.rooms).values([{ id: 1, name: "공학실습동" }, { id: 2, name: "학생회관" }]).run();
    db.insert(schema.members).values({
      id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("추가하면 집계에 잡히고 증명 등급이 admin 이다", () => {
    const r = s.createSessionManually({
      memberId: 1, roomId: 2, startedAt: T0, endedAt: T0 + 2 * 3600,
      editorEmail: "admin@b.com", now: NOW, note: "학생회관 배선 작업",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.start_proof).toBe("admin");
    expect(r.session.status).toBe("approved");
    expect(r.session.room_id).toBe(2);
    expect(a.memberTotals().find((x) => x.member.id === 1)!.countedSeconds).toBe(2 * 3600);
  });

  test("누가 넣었는지 이력에 남는다", () => {
    const r = s.createSessionManually({
      memberId: 1, roomId: 2, startedAt: T0, endedAt: T0 + 3600,
      editorEmail: "admin@b.com", now: NOW,
    });
    if (!r.ok) return;
    const edits = s.listEdits(r.session.id);
    expect(edits).toHaveLength(1);
    expect(edits[0].editor_email).toBe("admin@b.com");
    // 새 기록이므로 이전 상태가 없다.
    expect(JSON.parse(edits[0].before_json)).toBeNull();
  });

  test("역전·미래·24시간 초과·없는 멤버·없는 방은 거절", () => {
    const base = { memberId: 1, roomId: 2, editorEmail: "admin@b.com", now: NOW };
    expect(s.createSessionManually({ ...base, startedAt: T0 + 100, endedAt: T0 }).ok).toBe(false);
    expect(s.createSessionManually({ ...base, startedAt: T0, endedAt: NOW + 3600 }).ok).toBe(false);
    expect(s.createSessionManually({ ...base, startedAt: T0, endedAt: T0 + 25 * 3600 }).ok).toBe(false);
    expect(s.createSessionManually({ ...base, memberId: 999, startedAt: T0, endedAt: T0 + 3600 }).ok).toBe(false);
    expect(s.createSessionManually({ ...base, roomId: 99, startedAt: T0, endedAt: T0 + 3600 }).ok).toBe(false);
    expect(db.select().from(schema.studySessions).all()).toHaveLength(0);
  });
});
