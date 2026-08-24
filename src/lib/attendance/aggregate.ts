import { db, schema } from "@/lib/db/index";
import { COUNTED_STATUSES, type StudySession } from "./sessions";
import { studyWeekStart } from "@/lib/week";
import { countedRegion, overlapSeconds, unionSeconds, type Interval } from "./quota";
import { getTeamQuotaSeconds } from "./settings";
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

/** 세부팀 한 주의 쿼터 사용 현황. */
export type TeamWeekUsage = {
  team: string;
  /** 월요일 00:00 (studyWeekStart) */
  weekStart: number;
  /** 팀이 실제로 점유한 시간 = 구간 합집합. 상한 적용 전. */
  unionSeconds: number;
  /** 쿼터 안에서 인정된 시간 = min(union, quota) */
  usedSeconds: number;
  quotaSeconds: number;
  /** 남은 시간. 초과했으면 0. */
  remainingSeconds: number;
  exceeded: boolean;
};

/**
 * 쿼터 계산에 참여하는 세션인지.
 *
 * `import` 는 제외한다 — 엑셀에서 옮겨온 과거 기록으로, 세부팀장들이 이미 주당
 * 쿼터를 맞춰서 적어둔 값이다. 게다가 시작 시각이 전부 19:00 으로 합성돼 있어
 * 합집합을 계산하면 서로 겹쳐 실제와 무관한 숫자가 나온다. 그대로 통과시킨다.
 */
function participatesInQuota(row: Row): boolean {
  return row.start_proof !== "import";
}

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

type RegionMap = Map<string, Interval[]>;

function bucketKey(team: string, weekTs: number): string {
  return `${team}|${weekTs}`;
}

/** 팀×주마다 쿼터 안에 드는 구간을 미리 계산해 둔다. */
function quotaRegions(rows: Row[], byId: Map<number, Member>, quota: number): RegionMap {
  const buckets = new Map<string, Interval[]>();
  for (const r of rows) {
    if (!participatesInQuota(r)) continue;
    const team = byId.get(r.member_id)?.sub_team;
    if (!team) continue;
    const key = bucketKey(team, studyWeekStart(r.started_at));
    const list = buckets.get(key) ?? [];
    list.push({ start: r.started_at, end: r.ended_at as number });
    buckets.set(key, list);
  }

  const out: RegionMap = new Map();
  for (const [key, intervals] of buckets) {
    out.set(key, countedRegion(intervals, quota));
  }
  return out;
}

/** 세션 하나가 실제로 인정받는 초. */
function countedSecondsFor(r: Row, byId: Map<number, Member>, regions: RegionMap): number {
  const dur = (r.ended_at as number) - r.started_at;
  if (!participatesInQuota(r)) return dur;
  const team = byId.get(r.member_id)?.sub_team;
  if (!team) return dur;
  const region = regions.get(bucketKey(team, studyWeekStart(r.started_at)));
  if (!region) return dur;
  return overlapSeconds({ start: r.started_at, end: r.ended_at as number }, region);
}

/**
 * 세션 id → 실제 인정된 초.
 *
 * 쿼터 경계에 걸려 일부만 인정된 기록을 화면에 그대로 보여주기 위해 쓴다.
 * "왜 3시간 있었는데 1시간만 들어갔지?"에 답할 수 없으면 규칙이 불신을 산다.
 */
export function countedSecondsBySession(memberId: number, opts?: { quotaSeconds?: number }): Map<number, number> {
  const members = db.select().from(schema.members).all();
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = countedRows();
  const quota = opts?.quotaSeconds ?? getTeamQuotaSeconds();
  const regions = quotaRegions(rows, byId, quota);

  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.member_id !== memberId) continue;
    out.set(r.id, countedSecondsFor(r, byId, regions));
  }
  return out;
}

/**
 * 세부팀별 이번 주(또는 지정한 주) 쿼터 사용 현황.
 * 화면에 "이번 주 남은 시간"을 띄우는 데 쓴다.
 */
export function teamWeekUsage(weekTs: number, opts?: { quotaSeconds?: number }): TeamWeekUsage[] {
  const members = db.select().from(schema.members).all();
  const byId = new Map(members.map((m) => [m.id, m]));
  const quota = opts?.quotaSeconds ?? getTeamQuotaSeconds();

  const buckets = new Map<string, Interval[]>();
  for (const t of SUB_TEAMS) buckets.set(t, []);

  for (const r of countedRows()) {
    if (!participatesInQuota(r)) continue;
    if (studyWeekStart(r.started_at) !== weekTs) continue;
    const team = byId.get(r.member_id)?.sub_team;
    if (!team || !buckets.has(team)) continue;
    buckets.get(team)!.push({ start: r.started_at, end: r.ended_at as number });
  }

  return SUB_TEAMS.map((team) => {
    const union = unionSeconds(buckets.get(team) ?? []);
    const used = Math.min(union, quota);
    return {
      team,
      weekStart: weekTs,
      unionSeconds: union,
      usedSeconds: used,
      quotaSeconds: quota,
      remainingSeconds: Math.max(0, quota - union),
      exceeded: union > quota,
    };
  });
}

/**
 * 멤버별 누적 시간.
 *
 * 개인 인정 시간은 자기 시간 그대로다. 다만 소속 세부팀이 그 주의 쿼터를 다 쓴
 * 뒤의 시간은 빠진다 — 그 경계에 걸친 세션은 "일부만 인정"된다.
 * 상한 전 시간(`rawSeconds`)도 함께 반환한다: 깎인 이유가 화면에서 납득되어야 한다.
 */
export function memberTotals(opts?: { quotaSeconds?: number }): Ranking[] {
  const members = db.select().from(schema.members).all();
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = countedRows();

  const raw = new Map<number, number>();
  const counted = new Map<number, number>();
  const count = new Map<number, number>();
  const adjusted = new Map<number, number>();

  // 팀×주 단위로 인정 구간을 먼저 구한다. 개인 인정 시간은 자기 세션이 그
  // 구간과 겹치는 만큼이다 — 쿼터가 바닥나기 전이면 제 시간 전부를 받고,
  // 바닥난 뒤 시간만 빠진다.
  const quota = opts?.quotaSeconds ?? getTeamQuotaSeconds();
  const regions = quotaRegions(rows, byId, quota);

  for (const r of rows) {
    const dur = (r.ended_at as number) - r.started_at;
    raw.set(r.member_id, (raw.get(r.member_id) ?? 0) + dur);
    count.set(r.member_id, (count.get(r.member_id) ?? 0) + 1);
    if (ADJUSTED.has(r.status)) adjusted.set(r.member_id, (adjusted.get(r.member_id) ?? 0) + 1);

    counted.set(r.member_id, (counted.get(r.member_id) ?? 0) + countedSecondsFor(r, byId, regions));
  }

  const out: Ranking[] = [];
  // 기록이 없는 멤버도 0시간으로 포함한다. 엔트리 순서를 보는 표에서
  // 자기 이름을 찾지 못하면 "내가 몇 등인지"를 확인할 수 없다.
  for (const member of members) {
    const memberId = member.id;
    const rawSeconds = raw.get(memberId) ?? 0;
    const countedSeconds = counted.get(memberId) ?? 0;
    out.push({
      member,
      rawSeconds,
      countedSeconds,
      sessionCount: count.get(memberId) ?? 0,
      adjustedCount: adjusted.get(memberId) ?? 0,
    });
  }
  // countedSeconds 가 같으면 student_no 오름차순으로 확정한다. 이 대회 엔트리
  // 순서를 결정하는 목록이므로, 동점자 순서가 SELECT의 우연한 rowid 순서에
  // 좌우되어 새로고침마다 뒤바뀌는 일이 있어서는 안 된다. student_no는
  // unique·not-null이라 전순서(total order)가 보장된다. 순번 자체는 임의적이지만
  // 고정이라, 시간이 바뀌지 않는 한 순위도 바뀌지 않는다.
  out.sort((a, b) => b.countedSeconds - a.countedSeconds || a.member.student_no.localeCompare(b.member.student_no));
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

/** 날짜 → 초. 전기팀 전체를 한 장으로 보는 잔디용. */
export function allDailyBuckets(fromTs: number, toTs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of countedRows()) {
    if (r.started_at < fromTs || r.started_at > toTs) continue;
    const k = dateKey(r.started_at);
    out[k] = (out[k] ?? 0) + ((r.ended_at as number) - r.started_at);
  }
  return out;
}
