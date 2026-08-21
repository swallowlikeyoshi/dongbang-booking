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

// 0 이하(0, 음수)이거나 빈 문자열·비숫자는 모두 "미설정"으로 취급한다.
// 이렇게 정규화된 값을 반환해야 호출부(순위표 페이지 등)가 별도 방어 코드
// 없이 getter의 결과만으로 "상한/정원이 있는가"를 판단할 수 있다.
function numeric(key: string): number | null {
  const raw = getSetting(key);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
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
