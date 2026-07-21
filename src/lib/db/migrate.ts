import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { rooms } from "./schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? "./data/dongbang.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });

const defaults = [
  { id: 1, name: "동방 A" },
  { id: 2, name: "동방 B" },
];
for (const r of defaults) {
  const existing = db.select().from(rooms).where(eq(rooms.id, r.id)).all();
  if (existing.length === 0) db.insert(rooms).values(r).run();
}

console.log("migrate + seed done:", dbPath);
sqlite.close();
