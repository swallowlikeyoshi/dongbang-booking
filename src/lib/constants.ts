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

export const SUB_TEAMS = [
  "계기 및 데이터",
  "배터리 및 전원",
  "배선 및 하네스",
  "토크 벡터링",
] as const;
export type SubTeam = (typeof SUB_TEAMS)[number];

/** 세부팀 색상. 색각 이상 시뮬레이션 포함 전 조합 분리도 검증을 통과한 조합. */
export const SUB_TEAM_COLORS: Record<SubTeam, string> = {
  "계기 및 데이터": "#2a78d6",
  "배터리 및 전원": "#eb6834",
  "배선 및 하네스": "#1baf7a",
  "토크 벡터링": "#4a3aa7",
};
