import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("sessions", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.usedCodes).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("체크인하면 open 세션이 생긴다", () => {
    const r = s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(r.ok).toBe(true);
    expect(s.currentSession(1)?.status).toBe("open");
  });

  test("이미 진행 중이면 중복 체크인 거절", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.openSession({ memberId: 1, roomId: 1, ts: T0 + 10, slot: 101 });
    expect(r.ok).toBe(false);
  });

  test("QR 종료하면 confirmed", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "qr" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.status).toBe("confirmed");
      expect(r.session.ended_at).toBe(T0 + 3600);
    }
  });

  test("QR 없이 종료하면 pending", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.status).toBe("pending");
  });

  test("진행 중이 아니면 종료 실패", () => {
    expect(s.closeSession({ memberId: 1, ts: T0, proof: "qr" }).ok).toBe(false);
  });

  test("같은 (슬롯, 멤버)로는 두 번 소각할 수 없다", () => {
    expect(s.burnCode(1, 100, T0)).toBe(true);
    expect(s.burnCode(1, 100, T0)).toBe(false);
  });

  test("다른 멤버는 같은 슬롯을 소각할 수 있다", () => {
    db.insert(schema.members).values({
      id: 2, student_no: "2022313526", name: "곽효건", sub_team: "배선 및 하네스", created_at: 0,
    }).run();
    expect(s.burnCode(1, 100, T0)).toBe(true);
    expect(s.burnCode(2, 100, T0)).toBe(true);
  });

  test("QR 종료는 10시간을 넘어도 confirmed", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 12 * 3600, proof: "qr" });
    if (r.ok) expect(r.session.status).toBe("confirmed");
  });

  test("사전 체크를 우회해도 DB 유일 제약이 소각 중복을 막는다", () => {
    // burnCode를 거치지 않고 직접 insert하여 애플리케이션 레벨 사전 조회를 우회한다.
    db.insert(schema.usedCodes).values({ member_id: 1, slot: 100, used_at: T0 }).run();
    expect(() => s.burnCode(1, 100, T0 + 1)).not.toThrow();
    expect(s.burnCode(1, 100, T0 + 1)).toBe(false);
  });
});
