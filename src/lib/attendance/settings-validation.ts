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
  if (value !== "" && !Number.isFinite(Number(value))) {
    return { ok: false, error: "숫자를 입력해주세요." };
  }
  return { ok: true, key, value };
}
