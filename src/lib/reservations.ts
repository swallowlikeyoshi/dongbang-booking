import { SLOT_SECONDS, TEAMS } from "./constants";

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
