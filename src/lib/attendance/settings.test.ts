import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const st = await import("./settings");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("settings", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.settings).run();
  });

  test("없으면 null", () => {
    expect(st.getSetting("nope")).toBeNull();
    expect(st.getEntryQuota()).toBeNull();
  });

  test("팀 쿼터는 미설정이면 기본 10시간 — null 이 아니다", () => {
    // 상한이 "없음"이 되면 아무도 깎이지 않아 규칙 자체가 사라진다.
    // 설정하지 않은 서버에서도 전기팀 규칙이 그대로 적용되어야 한다.
    expect(st.getTeamQuotaSeconds()).toBe(10 * 3600);
  });

  test("설정하면 읽힌다", () => {
    st.setSetting("weekly_cap_hours", "20");
    expect(st.getTeamQuotaSeconds()).toBe(20 * 3600);
  });

  test("덮어쓰기 가능", () => {
    st.setSetting("entry_quota", "30");
    st.setSetting("entry_quota", "25");
    expect(st.getEntryQuota()).toBe(25);
  });

  test.each(["0", "-5", "", "abc"])("팀 쿼터: 잘못된 값 '%s' 는 기본값으로", (v) => {
    // 관리자가 실수로 0이나 빈 값을 넣어도 쿼터가 사라지면 안 된다.
    st.setSetting("weekly_cap_hours", v);
    expect(st.getTeamQuotaSeconds()).toBe(10 * 3600);
  });

  test.each(["0", "-5", "", "abc"])("getEntryQuota: '%s' 는 null", (v) => {
    st.setSetting("entry_quota", v);
    expect(st.getEntryQuota()).toBeNull();
  });
});
