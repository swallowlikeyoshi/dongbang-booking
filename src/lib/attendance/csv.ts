/**
 * CSV 셀 이스케이프. 두 가지를 막는다:
 * 1) 필드 안에 쉼표·따옴표·개행이 있을 때 열이 밀리는 것 (RFC 4180 quoting).
 * 2) `=`,`+`,`-`,`@` 로 시작하는 값이 엑셀/구글시트에서 수식으로 실행되는
 *    CSV 인젝션 — 자기소개(이름) 필드는 회원이 자유 입력하므로 반드시 막아야 한다.
 * 헤더 행을 포함해 모든 필드에 적용한다.
 */
export function escapeCsvCell(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}
