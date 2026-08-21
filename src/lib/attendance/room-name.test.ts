import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { resolveRoomName } = await import("./room-name");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("resolveRoomName", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.rooms).run();
    db.insert(schema.rooms).values([
      { id: 1, name: "공학실습동(24214)" },
      { id: 2, name: "학생회관(03324)" },
      { id: 3, name: "공작실(24112A)" },
    ]).run();
  });

  test("seeded rooms 테이블의 이름을 괄호까지 그대로 반환한다", () => {
    expect(resolveRoomName(1)).toBe("공학실습동(24214)");
    expect(resolveRoomName(2)).toBe("학생회관(03324)");
    expect(resolveRoomName(3)).toBe("공작실(24112A)");
  });

  test("일치하는 방이 없으면 동방으로 대체한다", () => {
    expect(resolveRoomName(999)).toBe("동방");
  });
});
