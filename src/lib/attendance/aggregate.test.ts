import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const a = await import("./aggregate");
const { db, schema } = await import("@/lib/db/index");
const { listSessionsByMember } = await import("./sessions");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { studyWeekStart } from "@/lib/week";

const T0 = 1_700_000_000;

function addSession(memberId: number, start: number, end: number, status: string, proof = "qr") {
  db.insert(schema.studySessions).values({
    member_id: memberId, room_id: 1, started_at: start, ended_at: end,
    start_proof: proof, end_proof: proof, status, created_at: start,
  }).run();
}

const H = (h: number) => h * 3600;
/** 어떤 주의 월요일 09:00 — 테스트 기준점. */
const MON9 = studyWeekStart(T0) + 9 * 3600;

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

  test("같은 팀이 같은 시간에 함께 있으면 쿼터는 한 번만 깎인다", () => {
    // 이 규칙의 핵심. 6명이 6시간 함께 있으면 팀은 36시간이 아니라 6시간을 쓴 것이다.
    // 개인은 각자 6시간을 그대로 받는다.
    db.insert(schema.members).values(
      [3, 4, 5, 6].map((id) => ({
        id, student_no: String(id), name: `팀원${id}`, sub_team: "토크 벡터링", created_at: 0,
      }))
    ).run();
    for (const id of [1, 3, 4, 5, 6]) addSession(id, MON9, MON9 + H(6), "confirmed");

    const r = a.memberTotals();
    for (const id of [1, 3, 4, 5, 6]) {
      expect(r.find((x) => x.member.id === id)!.countedSeconds).toBe(H(6));
    }
    const usage = a.teamWeekUsage(studyWeekStart(MON9))
      .find((u) => u.team === "토크 벡터링")!;
    expect(usage.unionSeconds).toBe(H(6));
    expect(usage.remainingSeconds).toBe(H(4));
    expect(usage.exceeded).toBe(false);
  });

  test("사용자 예시: A 11~16, B 12~17 이면 팀은 6시간을 쓴다", () => {
    const eleven = MON9 + H(2);
    db.insert(schema.members).values([
      { id: 3, student_no: "3", name: "다", sub_team: "토크 벡터링", created_at: 0 },
    ]).run();
    addSession(1, eleven, eleven + H(5), "confirmed");        // 11~16
    addSession(3, eleven + H(1), eleven + H(6), "confirmed"); // 12~17

    const usage = a.teamWeekUsage(studyWeekStart(eleven))
      .find((u) => u.team === "토크 벡터링")!;
    expect(usage.unionSeconds).toBe(H(6));
    expect(usage.remainingSeconds).toBe(H(4));
    // 개인은 각자 5시간씩 그대로
    const r = a.memberTotals();
    expect(r.find((x) => x.member.id === 1)!.countedSeconds).toBe(H(5));
    expect(r.find((x) => x.member.id === 3)!.countedSeconds).toBe(H(5));
  });

  test("쿼터를 넘기면 넘어선 시간만 빠진다 — 일부만 인정", () => {
    // 혼자 12시간: 10시간까지만 인정된다.
    addSession(1, MON9, MON9 + H(12), "confirmed");
    const r = a.memberTotals().find((x) => x.member.id === 1)!;
    expect(r.rawSeconds).toBe(H(12));
    expect(r.countedSeconds).toBe(H(10));
  });

  test("쿼터 소진 후 시작한 세션은 인정되지 않는다", () => {
    db.insert(schema.members).values([
      { id: 3, student_no: "3", name: "다", sub_team: "토크 벡터링", created_at: 0 },
    ]).run();
    addSession(1, MON9, MON9 + H(10), "confirmed");          // 쿼터를 정확히 채움
    addSession(3, MON9 + H(10), MON9 + H(12), "confirmed");  // 그 뒤 2시간

    const r = a.memberTotals();
    expect(r.find((x) => x.member.id === 1)!.countedSeconds).toBe(H(10));
    expect(r.find((x) => x.member.id === 3)!.countedSeconds).toBe(0);
  });

  test("쿼터 경계에 걸친 세션은 걸친 만큼만 인정된다", () => {
    db.insert(schema.members).values([
      { id: 3, student_no: "3", name: "다", sub_team: "토크 벡터링", created_at: 0 },
    ]).run();
    addSession(1, MON9, MON9 + H(9), "confirmed");           // 9시간
    addSession(3, MON9 + H(9), MON9 + H(12), "confirmed");   // 이어서 3시간 → 1시간만

    const r = a.memberTotals();
    expect(r.find((x) => x.member.id === 1)!.countedSeconds).toBe(H(9));
    expect(r.find((x) => x.member.id === 3)!.countedSeconds).toBe(H(1));
  });

  test("팀이 다르면 쿼터를 따로 쓴다", () => {
    addSession(1, MON9, MON9 + H(10), "confirmed"); // 토크 벡터링
    addSession(2, MON9, MON9 + H(10), "confirmed"); // 계기 및 데이터
    const r = a.memberTotals();
    expect(r.find((x) => x.member.id === 1)!.countedSeconds).toBe(H(10));
    expect(r.find((x) => x.member.id === 2)!.countedSeconds).toBe(H(10));
  });

  test("주가 다르면 쿼터가 리셋된다", () => {
    addSession(1, MON9, MON9 + H(10), "confirmed");
    addSession(1, MON9 + 7 * 24 * 3600, MON9 + 7 * 24 * 3600 + H(10), "confirmed");
    const r = a.memberTotals().find((x) => x.member.id === 1)!;
    expect(r.countedSeconds).toBe(H(20));
  });

  test("import 기록은 쿼터를 소모하지도, 깎이지도 않는다", () => {
    // 엑셀에서 옮겨온 과거 기록은 세부팀장이 이미 쿼터를 맞춰 적은 값이다.
    // 게다가 시작 시각이 전부 19:00 으로 합성돼 있어 합집합이 의미가 없다.
    addSession(1, MON9, MON9 + H(30), "approved", "import");
    const r = a.memberTotals().find((x) => x.member.id === 1)!;
    expect(r.countedSeconds).toBe(H(30));

    const usage = a.teamWeekUsage(studyWeekStart(MON9))
      .find((u) => u.team === "토크 벡터링")!;
    expect(usage.unionSeconds).toBe(0);
    expect(usage.remainingSeconds).toBe(H(10));
  });

  test("import 가 있어도 QR 세션의 쿼터 계산은 그대로다", () => {
    addSession(1, MON9, MON9 + H(30), "approved", "import");
    addSession(1, MON9, MON9 + H(12), "confirmed");
    const r = a.memberTotals().find((x) => x.member.id === 1)!;
    expect(r.countedSeconds).toBe(H(30) + H(10)); // import 전부 + QR 10시간
  });

  test("countedSeconds 가 같으면 student_no 오름차순으로 정렬된다 (1)", () => {
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 1, student_no: "20230002", name: "가", sub_team: "토크 벡터링", created_at: 0 },
      { id: 2, student_no: "20230001", name: "나", sub_team: "계기 및 데이터", created_at: 0 },
    ]).run();
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(2, T0, T0 + 3600, "confirmed");
    const r = a.memberTotals();
    expect(r[0].countedSeconds).toBe(r[1].countedSeconds);
    expect(r.map((x) => x.member.student_no)).toEqual(["20230001", "20230002"]);
  });

  test("countedSeconds 가 같으면 student_no 오름차순으로 정렬된다 (2, 별도 데이터로 재확인)", () => {
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 5, student_no: "9", name: "다", sub_team: "배선 및 하네스", created_at: 0 },
      { id: 6, student_no: "3", name: "라", sub_team: "배터리 및 전원", created_at: 0 },
      { id: 7, student_no: "7", name: "마", sub_team: "토크 벡터링", created_at: 0 },
    ]).run();
    addSession(5, T0, T0 + 1800, "confirmed");
    addSession(6, T0, T0 + 1800, "confirmed");
    addSession(7, T0, T0 + 1800, "confirmed");
    const r = a.memberTotals();
    expect(r.map((x) => x.countedSeconds)).toEqual([1800, 1800, 1800]);
    expect(r.map((x) => x.member.student_no)).toEqual(["3", "7", "9"]);
  });

  test("기록 없는 멤버도 0시간으로 포함된다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    const r = a.memberTotals();
    // 엔트리 순서를 보는 표라 아무도 목록에서 빠지면 안 된다.
    expect(r.map((x) => x.member.id).sort()).toEqual([1, 2]);
    const zero = r.find((x) => x.member.id === 2)!;
    expect(zero.countedSeconds).toBe(0);
    expect(zero.rawSeconds).toBe(0);
    expect(zero.sessionCount).toBe(0);
    // 시간이 있는 사람이 앞에 온다.
    expect(r[0].member.id).toBe(1);
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

  test("weekSecondsFor 는 COUNTED_STATUSES 만 합산한다 — 6개 상태 모두 넣고 3개만 세야 한다", () => {
    const ws = studyWeekStart(T0);
    const statuses = ["open", "confirmed", "pending", "approved", "rejected", "unresolved"];
    statuses.forEach((status, i) => {
      addSession(1, ws + i * 3600, ws + i * 3600 + 1800, status);
    });
    const sessions = listSessionsByMember(1);
    // confirmed + pending + approved = 3 * 1800 = 5400
    expect(a.weekSecondsFor(sessions, ws)).toBe(5400);
  });

  test("weekSecondsFor 는 주 시작 이전 세션을 제외한다", () => {
    const ws = studyWeekStart(T0);
    addSession(1, ws - 3600, ws - 3600 + 1800, "confirmed"); // 지난 주
    addSession(1, ws + 3600, ws + 3600 + 1800, "confirmed"); // 이번 주
    const sessions = listSessionsByMember(1);
    expect(a.weekSecondsFor(sessions, ws)).toBe(1800);
  });
});

describe("countedSecondsBySession", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0 },
      { id: 3, student_no: "3", name: "다", sub_team: "토크 벡터링", created_at: 0 },
    ]).run();
  });

  test("쿼터에 안 걸리면 세션 시간 그대로", () => {
    addSession(1, MON9, MON9 + H(3), "confirmed");
    const m = a.countedSecondsBySession(1);
    expect([...m.values()]).toEqual([H(3)]);
  });

  test("경계에 걸친 세션만 줄어든다", () => {
    addSession(1, MON9, MON9 + H(9), "confirmed");          // 팀 쿼터 9시간 소모
    addSession(3, MON9 + H(9), MON9 + H(12), "confirmed");  // 1시간만 인정
    const mine = a.countedSecondsBySession(3);
    expect([...mine.values()]).toEqual([H(1)]);
    const first = a.countedSecondsBySession(1);
    expect([...first.values()]).toEqual([H(9)]);
  });

  test("다른 사람 세션은 들어오지 않는다", () => {
    addSession(1, MON9, MON9 + H(1), "confirmed");
    addSession(3, MON9, MON9 + H(1), "confirmed");
    expect(a.countedSecondsBySession(1).size).toBe(1);
  });
});
