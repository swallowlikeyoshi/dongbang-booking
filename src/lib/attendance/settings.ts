import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";

export function getSetting(key: string): string | null {
  const rows = db.select().from(schema.settings).where(eq(schema.settings.key, key)).all();
  return rows[0]?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const existing = getSetting(key);
  if (existing === null) {
    db.insert(schema.settings).values({ key, value }).run();
  } else {
    db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key)).run();
  }
}

function numeric(key: string): number | null {
  const raw = getSetting(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 주간 인정 시간 상한. 미설정이면 null(상한 없음). */
export function getWeeklyCapSeconds(): number | null {
  const hours = numeric("weekly_cap_hours");
  return hours === null ? null : hours * 3600;
}

/** 엔트리 정원. 순위표의 컷 라인. */
export function getEntryQuota(): number | null {
  return numeric("entry_quota");
}
