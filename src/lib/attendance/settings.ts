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

/** 팀 주간 쿼터의 기본값. 전기팀 규칙상 세부팀당 주 10시간. */
export const DEFAULT_TEAM_QUOTA_SECONDS = 10 * 3600;

/**
 * 세부팀 주간 쿼터(초). 미설정이면 기본 10시간.
 *
 * 이 값은 팀원 개개인의 상한이 아니라 **팀이 방을 점유한 시간**(구간 합집합)의
 * 상한이다. 여섯 명이 같은 방에 여섯 시간 있었으면 팀은 6시간을 쓴 것이지
 * 36시간을 쓴 것이 아니다. 자세한 계산은 `quota.ts` 참고.
 */
export function getTeamQuotaSeconds(): number {
  const hours = numeric("weekly_cap_hours");
  return hours === null ? DEFAULT_TEAM_QUOTA_SECONDS : hours * 3600;
}

/** 엔트리 정원. 순위표의 컷 라인. */
export function getEntryQuota(): number | null {
  return numeric("entry_quota");
}
