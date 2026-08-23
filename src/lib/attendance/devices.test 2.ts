import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.ATTENDANCE_DEVICE_SECRETS = "1:aaa,2:bbb";

const d = await import("./devices");
const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("devices", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.deviceHeartbeats).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("하트비트가 없으면 오프라인", () => {
    const st = d.deviceStatuses(T0);
    expect(st).toHaveLength(2);
    expect(st[0].online).toBe(false);
    expect(st[0].lastSeenAt).toBeNull();
  });

  test("최근 하트비트가 있으면 온라인", () => {
    d.recordHeartbeat(1, T0, "v1");
    const st = d.deviceStatuses(T0 + 60);
    expect(st.find((x) => x.roomId === 1)?.online).toBe(true);
    expect(st.find((x) => x.roomId === 2)?.online).toBe(false);
  });

  test("오래된 하트비트는 오프라인", () => {
    d.recordHeartbeat(1, T0);
    expect(d.deviceStatuses(T0 + d.OFFLINE_AFTER_SECONDS + 1)[0].online).toBe(false);
  });

  test("하트비트는 덮어쓴다", () => {
    d.recordHeartbeat(1, T0);
    d.recordHeartbeat(1, T0 + 300);
    expect(d.deviceStatuses(T0 + 310).find((x) => x.roomId === 1)?.lastSeenAt).toBe(T0 + 300);
  });

  test("재실 인원은 진행 중 세션 수", () => {
    expect(d.occupancy(1)).toBe(0);
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(d.occupancy(1)).toBe(1);
    expect(d.occupancy(2)).toBe(0);
  });
});
