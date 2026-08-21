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
    expect(st.getWeeklyCapSeconds()).toBeNull();
    expect(st.getEntryQuota()).toBeNull();
  });

  test("설정하면 읽힌다", () => {
    st.setSetting("weekly_cap_hours", "20");
    expect(st.getWeeklyCapSeconds()).toBe(20 * 3600);
  });

  test("덮어쓰기 가능", () => {
    st.setSetting("entry_quota", "30");
    st.setSetting("entry_quota", "25");
    expect(st.getEntryQuota()).toBe(25);
  });

  test("숫자가 아니면 null", () => {
    st.setSetting("weekly_cap_hours", "abc");
    expect(st.getWeeklyCapSeconds()).toBeNull();
  });
});
