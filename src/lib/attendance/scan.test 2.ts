import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const sc = await import("./scan");
const sessLib = await import("./sessions");
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

  test("markPendingConsumed 후에는 재사용 불가", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 10)).not.toBeNull();
    sc.markPendingConsumed(id, T0 + 10);
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

  test("createPendingScan 은 TTL 을 넘긴 pending 행을 청소한다", () => {
    const oldId = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    sc.createPendingScan({ roomId: 1, slot: 200 }, T0 + sc.PENDING_TTL_SECONDS + 1);
    const rows = db.select().from(schema.pendingScans).all();
    expect(rows.find((r) => r.id === oldId)).toBeUndefined();
    expect(rows.length).toBe(1);
  });

  test("createPendingScan 은 TTL 이내의 행은 청소하지 않는다", () => {
    const recentId = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    sc.createPendingScan({ roomId: 1, slot: 200 }, T0 + 60);
    const rows = db.select().from(schema.pendingScans).all();
    expect(rows.find((r) => r.id === recentId)).not.toBeUndefined();
    expect(rows.length).toBe(2);
  });

  test("applyScan 이 실패해도 pending 은 소비되지 않아 재시도 가능", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    // 다른 탭에서 이미 같은 (슬롯, 멤버) 조합을 소각했다고 가정
    sessLib.burnCode(1, 100, T0);

    const p1 = sc.consumePendingScan(id, T0 + 5);
    expect(p1).not.toBeNull();
    const outcome = sc.applyScan({ memberId: 1, roomId: p1!.room_id, slot: p1!.slot, ts: p1!.scanned_at });
    expect(outcome.kind).toBe("error");

    // applyScan 실패는 pending 을 소비하지 않았으므로 다시 읽을 수 있어야 한다
    const p2 = sc.consumePendingScan(id, T0 + 10);
    expect(p2).not.toBeNull();
  });

  test("markPendingConsumed 는 pending 을 소비한다", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 5)).not.toBeNull();
    sc.markPendingConsumed(id, T0 + 5);
    expect(sc.consumePendingScan(id, T0 + 6)).toBeNull();
  });
});
