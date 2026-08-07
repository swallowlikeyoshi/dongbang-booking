export const SLOT_SECONDS = 1800;
export const WEEK_SECONDS = 7 * 24 * 3600;

/** 매주 반복 예약을 한 번에 잡을 수 있는 최대 주 수(한 학기 상당). */
export const MAX_REPEAT_WEEKS = 16;
/** 예약 모달의 반복 주 수 선택지. */
export const REPEAT_WEEK_OPTIONS = [4, 8, 12, 16] as const;

export const TEAMS = ["전기팀", "기계팀", "자율차팀", "기타"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_COLORS: Record<Team, string> = {
  전기팀: "bg-sky-600",
  기계팀: "bg-amber-600",
  자율차팀: "bg-emerald-600",
  기타: "bg-slate-500",
};
