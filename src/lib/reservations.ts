import { MAX_REPEAT_WEEKS, SLOT_SECONDS, TEAMS, WEEK_SECONDS } from "./constants";

export type NewReservationInput = {
  room_id: number;
  team: string;
  title: string | null;
  start_at: number;
  end_at: number;
};

export type ExistingReservation = {
  room_id: number;
  start_at: number;
  end_at: number;
};

export function snapToSlot(ts: number): number {
  return Math.floor(ts / SLOT_SECONDS) * SLOT_SECONDS;
}

/** 요청받은 반복 주 수를 1..MAX_REPEAT_WEEKS 범위의 정수로 정규화한다. */
export function normalizeRepeatWeeks(weeks: number | null | undefined): number {
  if (weeks === null || weeks === undefined || !Number.isFinite(weeks)) return 1;
  return Math.min(MAX_REPEAT_WEEKS, Math.max(1, Math.floor(weeks)));
}

/**
 * 매주 반복 예약을 개별 예약 N개로 펼친다.
 *
 * 반복을 규칙으로 저장하지 않고 실제 행으로 만들어 두는 이유: 겹침 검사와 주간
 * 조회가 기존 단발 예약과 완전히 같은 경로를 타고, 특정 회차만 취소하는 것도
 * 그냥 그 행을 지우면 된다. 한국은 서머타임이 없어 고정 7일 오프셋으로 충분하다.
 */
export function expandWeekly(input: NewReservationInput, weeks: number): NewReservationInput[] {
  const out: NewReservationInput[] = [];
  for (let i = 0; i < weeks; i++) {
    const shift = i * WEEK_SECONDS;
    out.push({ ...input, start_at: input.start_at + shift, end_at: input.end_at + shift });
  }
  return out;
}

export function overlaps(
  a: { start_at: number; end_at: number },
  b: { start_at: number; end_at: number },
): boolean {
  return a.start_at < b.end_at && b.start_at < a.end_at;
}

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateReservation(
  input: NewReservationInput,
  existing: ExistingReservation[],
): ValidationResult {
  if (!Number.isFinite(input.room_id)) {
    return { ok: false, error: "유효하지 않은 방입니다." };
  }
  if (!(TEAMS as readonly string[]).includes(input.team)) {
    return { ok: false, error: "유효하지 않은 팀입니다." };
  }
  if (input.start_at >= input.end_at) {
    return { ok: false, error: "종료 시각이 시작 시각보다 빨라야 합니다." };
  }
  if (input.start_at % SLOT_SECONDS !== 0 || input.end_at % SLOT_SECONDS !== 0) {
    return { ok: false, error: "30분 격자에 맞지 않습니다." };
  }
  for (const r of existing) {
    if (r.room_id === input.room_id && overlaps(input, r)) {
      return { ok: false, error: "이미 예약된 시간과 겹칩니다." };
    }
  }
  return { ok: true };
}
