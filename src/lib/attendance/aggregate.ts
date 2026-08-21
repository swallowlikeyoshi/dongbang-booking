import { db, schema } from "@/lib/db/index";
import { COUNTED_STATUSES, type StudySession } from "./sessions";
import { weekStart } from "@/lib/week";
import { SUB_TEAMS, type SubTeam } from "@/lib/constants";
import type { Member } from "@/lib/db/members";

export type Ranking = {
  member: Member;
  /** 상한 적용 전 */
  rawSeconds: number;
  /** 상한 적용 후 — 순위 기준 */
  countedSeconds: number;
  sessionCount: number;
  /** pending/approved 건수. 보정 비율 표시용. */
  adjustedCount: number;
};

const COUNTED = new Set<string>(COUNTED_STATUSES);
const ADJUSTED = new Set(["pending", "approved"]);

function dateKey(ts: number): string {
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Row = typeof schema.studySessions.$inferSelect;

function countedRows(): Row[] {
  return db.select().from(schema.studySessions).all()
    .filter((r) => COUNTED.has(r.status) && r.ended_at !== null);
}

/**
 * 멤버별 누적 시간. `weeklyCapSeconds` 를 주면 주 단위로 상한을 적용하되
 * 상한 전 시간(`rawSeconds`)도 함께 반환한다 — 깎인 이유가 화면에서 납득되어야 한다.
 */
export function memberTotals(opts?: { weeklyCapSeconds?: number }): Ranking[] {
  const members = db.select().from(schema.members).all();
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = countedRows();

  const raw = new Map<number, number>();
  const perWeek = new Map<number, Map<number, number>>();
  const count = new Map<number, number>();
  const adjusted = new Map<number, number>();

  for (const r of rows) {
    const dur = (r.ended_at as number) - r.started_at;
    raw.set(r.member_id, (raw.get(r.member_id) ?? 0) + dur);
    count.set(r.member_id, (count.get(r.member_id) ?? 0) + 1);
    if (ADJUSTED.has(r.status)) adjusted.set(r.member_id, (adjusted.get(r.member_id) ?? 0) + 1);

    const w = weekStart(r.started_at);
    const weeks = perWeek.get(r.member_id) ?? new Map<number, number>();
    weeks.set(w, (weeks.get(w) ?? 0) + dur);
    perWeek.set(r.member_id, weeks);
  }

  const out: Ranking[] = [];
  for (const [memberId, rawSeconds] of raw) {
    const member = byId.get(memberId);
    if (!member) continue;
    let countedSeconds = rawSeconds;
    const cap = opts?.weeklyCapSeconds;
    if (cap && cap > 0) {
      countedSeconds = 0;
      for (const sec of perWeek.get(memberId)?.values() ?? []) {
        countedSeconds += Math.min(sec, cap);
      }
    }
    out.push({
      member,
      rawSeconds,
      countedSeconds,
      sessionCount: count.get(memberId) ?? 0,
      adjustedCount: adjusted.get(memberId) ?? 0,
    });
  }
  out.sort((a, b) => b.countedSeconds - a.countedSeconds);
  return out;
}


/**
 * 세션 목록 중 이번 주(weekStartTs 이후 시작) + 집계 포함 상태(COUNTED_STATUSES)인
 * 것만 합산한다. `memberTotals`의 누적 집계와 같은 상태 기준을 공유하도록
 * `COUNTED_STATUSES`를 그대로 재사용한다 — 두 숫자가 서로 다른 상태 목록으로
 * 갈라지는 일이 없어야 한다.
 */
export function weekSecondsFor(sessions: StudySession[], weekStartTs: number): number {
  return sessions
    .filter((s) => s.ended_at !== null && s.started_at >= weekStartTs && COUNTED.has(s.status))
    .reduce((acc, s) => acc + ((s.ended_at as number) - s.started_at), 0);
}

/** 날짜(YYYY-MM-DD) → 초. 잔디 그래프용. */
export function dailyBuckets(memberId: number, fromTs: number, toTs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of countedRows()) {
    if (r.member_id !== memberId) continue;
    if (r.started_at < fromTs || r.started_at > toTs) continue;
    const k = dateKey(r.started_at);
    out[k] = (out[k] ?? 0) + ((r.ended_at as number) - r.started_at);
  }
  return out;
}

/** 세부팀 → 날짜 → 초. 스몰 멀티플 히트맵용. 팀 4개 키는 항상 존재한다. */
export function teamDailyBuckets(fromTs: number, toTs: number): Record<SubTeam, Record<string, number>> {
  const members = db.select().from(schema.members).all();
  const teamOf = new Map(members.map((m) => [m.id, m.sub_team as SubTeam]));
  const out = {} as Record<SubTeam, Record<string, number>>;
  for (const t of SUB_TEAMS) out[t] = {};

  for (const r of countedRows()) {
    if (r.started_at < fromTs || r.started_at > toTs) continue;
    const team = teamOf.get(r.member_id);
    // sub_team 은 신입 명부/온보딩 단계에서 SUB_TEAMS 4종으로 제약된다.
    // 여기서 매칭되지 않는 값은 데이터 이상치로 간주하고 조용히 건너뛴다(로깅/throw 안 함).
    if (!team || !out[team]) continue;
    const k = dateKey(r.started_at);
    out[team][k] = (out[team][k] ?? 0) + ((r.ended_at as number) - r.started_at);
  }
  return out;
}
