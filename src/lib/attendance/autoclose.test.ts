import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("자동 마감", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.sessionEdits).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("10시간 이내면 마감하지 않는다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(s.autoCloseStale(T0 + 9 * 3600)).toBe(0);
    expect(s.currentSession(1)?.status).toBe("open");
  });

  test("10시간 초과하면 unresolved 로 마감", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(s.autoCloseStale(T0 + 10 * 3600 + 1)).toBe(1);
    expect(s.currentSession(1)).toBeNull();
    const row = s.listSessionsByMember(1)[0];
    expect(row.status).toBe("unresolved");
    expect(row.ended_at).toBe(T0 + s.MAX_OPEN_SECONDS);
  });

  test("unresolved 는 집계에서 빠진다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const row = s.listSessionsByMember(1)[0];
    expect(s.COUNTED_STATUSES).not.toContain(row.status);
  });

  test("본인이 종료 시각을 신고하면 pending 이 된다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    const r = s.reportEndTime({ sessionId: id, memberId: 1, endedAt: T0 + 4 * 3600, note: "19시 퇴실", editorEmail: "a@b.com" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.status).toBe("pending");
      expect(r.session.ended_at).toBe(T0 + 4 * 3600);
    }
  });

  test("남의 세션은 신고할 수 없다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    expect(s.reportEndTime({ sessionId: id, memberId: 999, endedAt: T0 + 100, editorEmail: "x@y.com" }).ok).toBe(false);
  });

  test("신고 시각이 시작보다 빠르면 거절", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    expect(s.reportEndTime({ sessionId: id, memberId: 1, endedAt: T0 - 10, editorEmail: "a@b.com" }).ok).toBe(false);
  });

  test("관리자 승인하면 approved, 거부하면 rejected", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    const id = s.listSessionsByMember(1)[0].id;
    const a = s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    if (a.ok) expect(a.session.status).toBe("approved");
    const r = s.reviewSession({ sessionId: id, approve: false, editorEmail: "admin@b.com", reason: "미참석" });
    if (r.ok) expect(r.session.status).toBe("rejected");
  });

  test("수정 이력이 남는다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    const id = s.listSessionsByMember(1)[0].id;
    s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    expect(s.listEdits(id)).toHaveLength(1);
    expect(s.listEdits(id)[0].editor_email).toBe("admin@b.com");
  });

  test("open 세션은 review 할 수 없다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const id = s.listSessionsByMember(1)[0].id;
    const r = s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    expect(r.ok).toBe(false);
    expect(s.getSession(id)?.status).toBe("open");
  });

  test("unresolved 세션은 review 할 수 없다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    const r = s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    expect(r.ok).toBe(false);
  });

  test("approved 세션도 관리자가 rejected 로 정정할 수 있다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    const id = s.listSessionsByMember(1)[0].id;
    s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    const r = s.reviewSession({ sessionId: id, approve: false, editorEmail: "admin@b.com", reason: "정정" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.status).toBe("rejected");
  });

  test("autoCloseStale 은 마감된 세션마다 수정 이력을 남긴다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const id = s.listSessionsByMember(1)[0].id;
    s.autoCloseStale(T0 + 11 * 3600);
    const edits = s.listEdits(id);
    expect(edits).toHaveLength(1);
    expect(edits[0].editor_email).toBe("system");
    expect(JSON.parse(edits[0].before_json).status).toBe("open");
  });
});
