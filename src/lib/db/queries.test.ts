import { expect, test, describe, beforeEach } from "vitest";

// 인메모리 DB로 격리 테스트. DATABASE_PATH를 :memory: 로 두고 모듈 로드.
process.env.DATABASE_PATH = ":memory:";

const q = await import("./queries");
const { db, schema } = await import("./index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("queries", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.reservations).run();
    db.delete(schema.rooms).run();
    db.insert(schema.rooms).values([{ id: 1, name: "동방 A" }, { id: 2, name: "동방 B" }]).run();
  });

  test("listRooms 는 2개", () => {
    expect(q.listRooms()).toHaveLength(2);
  });

  test("createReservation 성공 후 listReservations 로 조회", () => {
    const r = q.createReservation({
      room_id: 1, team: "전기팀", title: "회의",
      start_at: 1800, end_at: 3600,
      user_email: "a@b.com", user_name: "A",
    });
    expect(r.ok).toBe(true);
    const list = q.listReservations(0, 10000);
    expect(list).toHaveLength(1);
    expect(list[0].team).toBe("전기팀");
  });

  test("겹치는 예약은 거절", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 5400, user_email: "a@b.com", user_name: "A" });
    const r = q.createReservation({ room_id: 1, team: "기계팀", title: null, start_at: 3600, end_at: 7200, user_email: "c@d.com", user_name: "C" });
    expect(r.ok).toBe(false);
  });

  test("deleteReservation 후 사라짐", () => {
    const r = q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    if (!r.ok) throw new Error("setup failed");
    q.deleteReservation(r.id);
    expect(q.listReservations(0, 10000)).toHaveLength(0);
  });

  test("renameRoom", () => {
    q.renameRoom(1, "새 이름");
    expect(q.listRooms().find((x) => x.id === 1)!.name).toBe("새 이름");
  });

  test("listReservationsByUser 는 본인 것만", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 2, team: "기계팀", title: null, start_at: 1800, end_at: 3600, user_email: "z@z.com", user_name: "Z" });
    expect(q.listReservationsByUser("a@b.com")).toHaveLength(1);
  });

  test("listAllReservations 는 전체", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 2, team: "기계팀", title: null, start_at: 1800, end_at: 3600, user_email: "z@z.com", user_name: "Z" });
    expect(q.listAllReservations()).toHaveLength(2);
  });

  test("존재하지 않는 방으로 예약하면 거절되고 아무것도 삽입되지 않음", () => {
    const r = q.createReservation({
      room_id: 999, team: "전기팀", title: null,
      start_at: 1800, end_at: 3600,
      user_email: "a@b.com", user_name: "A",
    });
    expect(r.ok).toBe(false);
    expect(q.listAllReservations()).toHaveLength(0);
  });

  test("nextReservation 은 가장 이른 미래 예약을 반환", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: "과거", start_at: 0, end_at: 1800, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 1, team: "기계팀", title: "나중", start_at: 5400, end_at: 7200, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 1, team: "자율차팀", title: "먼저", start_at: 3600, end_at: 5400, user_email: "a@b.com", user_name: "A" });
    const next = q.nextReservation(1, 1000);
    expect(next?.title).toBe("먼저");
  });

  test("nextReservation 은 예약이 없으면 null", () => {
    expect(q.nextReservation(2, 1000)).toBeNull();
  });

  test("currentReservation 은 진행 중인 예약을 반환", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: "진행중", start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    const cur = q.currentReservation(1, 2400);
    expect(cur?.title).toBe("진행중");
  });

  test("currentReservation 은 예약 사이 공백이면 null", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: "이전", start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    expect(q.currentReservation(1, 4000)).toBeNull();
  });

  test("currentReservation 은 시작 경계(start_at)에서 진행 중으로 간주", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: "경계", start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    const cur = q.currentReservation(1, 1800);
    expect(cur?.title).toBe("경계");
  });

  test("currentReservation 은 종료 경계(end_at)에서는 진행 중이 아님", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: "경계", start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    expect(q.currentReservation(1, 3600)).toBeNull();
  });
});
