export const SLOT_SECONDS = 1800;

export const TEAMS = ["전기팀", "기계팀", "자율차팀", "기타"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_COLORS: Record<Team, string> = {
  전기팀: "bg-sky-600",
  기계팀: "bg-amber-600",
  자율차팀: "bg-emerald-600",
  기타: "bg-slate-500",
};
