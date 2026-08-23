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
  // 기록이 없는 멤버도 0시간으로 포함한다. 엔트리 순서를 보는 표에서
  // 자기 이름을 찾지 못하면 "내가 몇 등인지"를 확인할 수 없다.
  for (const member of members) {
    const memberId = member.id;
    const rawSeconds = raw.get(memberId) ?? 0;
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
