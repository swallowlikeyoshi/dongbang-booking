import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const a = await import("./aggregate");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { weekStart } from "@/lib/week";

const T0 = 1_700_000_000;

function addSession(memberId: number, start: number, end: number, status: string) {
  db.insert(schema.studySessions).values({
    member_id: memberId, room_id: 1, started_at: start, ended_at: end,
    start_proof: "qr", end_proof: "qr", status, created_at: start,
  }).run();
}

describe("aggregate", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0 },
      { id: 2, student_no: "2", name: "나", sub_team: "계기 및 데이터", created_at: 0 },
    ]).run();
  });

  test("confirmed 만 있으면 그대로 합산", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "confirmed");
    const r = a.memberTotals();
    expect(r[0].countedSeconds).toBe(7200);
    expect(r[0].sessionCount).toBe(2);
  });

  test("unresolved / rejected 는 제외", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "unresolved");
    addSession(1, T0 + 14400, T0 + 18000, "rejected");
    expect(a.memberTotals()[0].countedSeconds).toBe(3600);
  });

  test("pending / approved 는 포함되고 보정 건수로 센다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "pending");
    addSession(1, T0 + 14400, T0 + 18000, "approved");
    const r = a.memberTotals()[0];
    expect(r.countedSeconds).toBe(10800);
    expect(r.adjustedCount).toBe(2);
  });

  test("누적 시간 내림차순으로 정렬", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(2, T0, T0 + 7200, "confirmed");
    const r = a.memberTotals();
    expect(r[0].member.id).toBe(2);
    expect(r[1].member.id).toBe(1);
  });

  test("주간 상한을 주면 상한 전/후가 모두 나온다", () => {
    addSession(1, T0, T0 + 10 * 3600, "confirmed");
    const r = a.memberTotals({ weeklyCapSeconds: 5 * 3600 })[0];
    expect(r.rawSeconds).toBe(10 * 3600);
    expect(r.countedSeconds).toBe(5 * 3600);
  });

  test("주간 상한: 서로 다른 주에 걸치면 각 주가 상한 이하여도 합산은 그대로 카운트된다", () => {
    // 이 테스트는 상한이 "주 단위"로 적용됨을 증명한다 — 전체합에 상한을 씌우는
    // 회귀(countedSeconds = min(rawSeconds, cap))로는 통과할 수 없어야 한다.
    const weekAStart = weekStart(T0);
    const weekBStart = weekAStart + 7 * 24 * 3600;

    addSession(1, weekAStart + 3600, weekAStart + 3600 + 4 * 3600, "confirmed"); // 주 A: 4h
    addSession(1, weekBStart + 3600, weekBStart + 3600 + 4 * 3600, "confirmed"); // 주 B: 4h

    const r = a.memberTotals({ weeklyCapSeconds: 5 * 3600 })[0];
    expect(r.rawSeconds).toBe(8 * 3600);
    expect(r.countedSeconds).toBe(8 * 3600);
  });

  test("주간 상한: 한 주는 상한에 걸리고 다른 주는 상한 미만이면 두 주 각각 계산된다", () => {
    const weekAStart = weekStart(T0);
    const weekBStart = weekAStart + 7 * 24 * 3600;

    addSession(1, weekAStart + 3600, weekAStart + 3600 + 10 * 3600, "confirmed"); // 주 A: 10h → 5h로 상한
    addSession(1, weekBStart + 3600, weekBStart + 3600 + 2 * 3600, "confirmed"); // 주 B: 2h → 그대로

    const r = a.memberTotals({ weeklyCapSeconds: 5 * 3600 })[0];
    expect(r.rawSeconds).toBe(12 * 3600);
    expect(r.countedSeconds).toBe(7 * 3600);
  });

  test("기록 없는 멤버는 목록에 없다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    expect(a.memberTotals().map((r) => r.member.id)).toEqual([1]);
  });

  test("dailyBuckets 는 날짜별 초를 준다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    const b = a.dailyBuckets(1, T0 - 86400, T0 + 86400);
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(3600);
  });

  test("teamDailyBuckets 는 세부팀별로 나뉜다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(2, T0, T0 + 7200, "confirmed");
    const t = a.teamDailyBuckets(T0 - 86400, T0 + 86400);
    expect(Object.values(t["토크 벡터링"]).reduce((x, y) => x + y, 0)).toBe(3600);
    expect(Object.values(t["계기 및 데이터"]).reduce((x, y) => x + y, 0)).toBe(7200);
    expect(Object.keys(t["배선 및 하네스"] ?? {})).toHaveLength(0);
  });
});
