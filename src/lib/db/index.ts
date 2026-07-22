import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;

/**
 * DB 연결을 지연 초기화한다.
 *
 * 모듈 로드 시점에 열면 `next build`가 API 라우트를 임포트하면서 SQLite 파일을
 * 열어버려, 병렬 빌드 워커끼리 "database is locked"로 충돌하고 빌드 산출물에
 * 불필요한 DB 파일이 생성된다. 실제 쿼리가 처음 실행될 때만 연결한다.
 */
function getDb(): Db {
  if (!instance) {
    const dbPath = process.env.DATABASE_PATH ?? "./data/dongbang.db";
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}

/** 기존 호출부(`db.select()` 등)를 그대로 두기 위한 지연 프록시. */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
}) as Db;

export { schema };
