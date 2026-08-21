const ALLOWED_KEYS = new Set(["weekly_cap_hours", "entry_quota"]);

export type SettingInputResult =
  | { ok: true; key: string; value: string }
  | { ok: false; error: string };

/**
 * `/api/attendance/settings` POST 바디 검증. 순위표 페이지가 매 로드마다 읽는
 * 값이라 저장 전에 반드시 통과해야 한다 — 라우트와 테스트가 같은 판정을 쓰도록
 * 순수 함수로 분리했다.
 */
export function validateSettingInput(body: unknown): SettingInputResult {
  const key = String((body as { key?: unknown } | null)?.key ?? "");
  if (!ALLOWED_KEYS.has(key)) return { ok: false, error: "알 수 없는 설정" };

  const value = String((body as { value?: unknown } | null)?.value ?? "").trim();
  // 빈 문자열은 "미설정"으로 허용한다. 그 외에는 1 이상의 정수만 받는다 —
  // getSetting의 숫자 getter들이 0 이하·비숫자를 조용히 null로 정규화하므로,
  // 여기서 걸러내지 않으면 "저장했습니다"라고 응답해놓고 실제로는 아무 값도
  // 적용되지 않는 상황이 생긴다. entry_quota는 인원수, weekly_cap_hours는
  // 정수 시간 단위라 둘 다 정수가 맞다.
  if (value !== "" && !/^\d+$/.test(value)) {
    return { ok: false, error: "1 이상의 정수를 입력해주세요." };
  }
  if (value !== "" && Number(value) <= 0) {
    return { ok: false, error: "1 이상의 정수를 입력해주세요." };
  }
  return { ok: true, key, value };
}
