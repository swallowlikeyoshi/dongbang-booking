import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const sc = await import("./scan");
const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("scan", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.pendingScans).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.usedCodes).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", user_email: "a@b.com", created_at: 0,
    }).run();
  });

  test("pending scan 은 10분 안에 소비 가능", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 60)?.room_id).toBe(1);
  });

  test("10분이 지나면 소비 불가", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + sc.PENDING_TTL_SECONDS + 1)).toBeNull();
  });

  test("한 번 소비하면 재사용 불가", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 10)).not.toBeNull();
    expect(sc.consumePendingScan(id, T0 + 20)).toBeNull();
  });

  test("진행 중이 없으면 체크인, 있으면 체크아웃", () => {
    const first = sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 });
    expect(first.kind).toBe("checked_in");
    const second = sc.applyScan({ memberId: 1, roomId: 1, slot: 101, ts: T0 + 3600 });
    expect(second.kind).toBe("checked_out");
    if (second.kind === "checked_out") expect(second.session.status).toBe("confirmed");
  });

  test("같은 슬롯을 두 번 쓰면 거절", () => {
    sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 });
    const again = sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 + 5 });
    expect(again.kind).toBe("error");
  });

  test("스캔 시각이 기록된다 — 나중에 적용해도 시각은 스캔 시점", () => {
    const id = sc.createPendingScan({ roomId: 2, slot: 100 }, T0);
    const p = sc.consumePendingScan(id, T0 + 300);
    expect(p?.scanned_at).toBe(T0);
    const r = sc.applyScan({ memberId: 1, roomId: p!.room_id, slot: p!.slot, ts: p!.scanned_at });
    if (r.kind === "checked_in") expect(r.session.started_at).toBe(T0);
  });
});
