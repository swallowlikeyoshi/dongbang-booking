import { SUB_TEAMS, type SubTeam } from "@/lib/constants";

const MAX_NAME_LENGTH = 20;

export type ClaimInput = { studentNo: unknown; name?: unknown; subTeam?: unknown };

export type ClaimValidation =
  | { ok: true; studentNo: string; name?: string; subTeam?: SubTeam }
  | { ok: false; error: string };

/** 학번이 정확히 숫자 10자리인지 검사한다. */
export function isValidStudentNo(value: unknown): value is string {
  return typeof value === "string" && /^\d{10}$/.test(value);
}

/** 클레임 요청 본문(POST) 또는 조회 파라미터(GET)에 공통으로 쓰이는 검증. */
export function validateClaimInput(input: ClaimInput): ClaimValidation {
  if (!isValidStudentNo(input.studentNo)) {
    return { ok: false, error: "학번 10자리를 입력해주세요." };
  }
  const studentNo = input.studentNo;

  const result: { ok: true; studentNo: string; name?: string; subTeam?: SubTeam } = {
    ok: true,
    studentNo,
  };

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `이름은 1자 이상 ${MAX_NAME_LENGTH}자 이하로 입력해주세요.` };
    }
    result.name = name;
  }

  if (input.subTeam !== undefined) {
    if (typeof input.subTeam !== "string" || !SUB_TEAMS.includes(input.subTeam as SubTeam)) {
      return { ok: false, error: "세부팀이 올바르지 않습니다." };
    }
    result.subTeam = input.subTeam as SubTeam;
  }

  return result;
}
