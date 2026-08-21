import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const m = await import("./members");
const { db, schema } = await import("./index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("members", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0 },
      { student_no: "2022313526", name: "곽효건", sub_team: "배선 및 하네스", created_at: 0 },
    ]).run();
  });

  test("학번으로 조회", () => {
    expect(m.getMemberByStudentNo("2025312077")?.name).toBe("김도현");
    expect(m.getMemberByStudentNo("9999999999")).toBeNull();
  });

  test("클레임하면 이메일로 조회된다", () => {
    const r = m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    expect(r.ok).toBe(true);
    expect(m.getMemberByEmail("a@b.com")?.student_no).toBe("2025312077");
  });

  test("이미 클레임된 학번은 거절", () => {
    m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    const r = m.claimMember({ studentNo: "2025312077", email: "c@d.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("이미");
  });

  test("한 계정이 두 학번을 클레임할 수 없다", () => {
    m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    const r = m.claimMember({ studentNo: "2022313526", email: "a@b.com" });
    expect(r.ok).toBe(false);
  });

  test("원장에 없는 학번은 pending 멤버로 생성", () => {
    const r = m.claimMember({ studentNo: "2026999999", email: "n@b.com", name: "신입", subTeam: "토크 벡터링" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.status).toBe("pending");
  });

  test("바인딩된 멤버를 언바인드하면 user_email 이 지워진다", () => {
    const claimed = m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;

    const r = m.unbindMember(claimed.member.id);
    expect(r.ok).toBe(true);
    expect(m.getMemberByStudentNo("2025312077")?.user_email).toBeNull();
  });

  test("언바인드된 학번은 다른 계정이 다시 클레임할 수 있다", () => {
    const claimed = m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    if (!claimed.ok) throw new Error("setup failed");
    m.unbindMember(claimed.member.id);

    const r = m.claimMember({ studentNo: "2025312077", email: "z@z.com" });
    expect(r.ok).toBe(true);
    expect(m.getMemberByEmail("z@z.com")?.student_no).toBe("2025312077");
  });

  test("바인딩되지 않은 멤버를 언바인드하면 실패", () => {
    const unbound = m.getMemberByStudentNo("2022313526");
    if (!unbound) throw new Error("setup failed");
    const r = m.unbindMember(unbound.id);
    expect(r.ok).toBe(false);
  });

  test("존재하지 않는 id 를 언바인드하면 실패", () => {
    const r = m.unbindMember(999999);
    expect(r.ok).toBe(false);
  });
});
