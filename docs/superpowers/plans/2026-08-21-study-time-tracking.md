# 스터디 시간 기록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ESP32가 60초마다 띄우는 서명된 QR을 스캔해 스터디 시작·종료를 기록하고, 누적 시간을 엔트리 순위·팀 히트맵으로 공개하는 기능을 `dongbang-booking`에 추가한다.

**Architecture:** ESP32는 공유 시크릿으로 TOTP식 6자리 코드를 만들어 QR로 표시만 한다. 서버가 같은 계산을 재현해 검증하므로 장비→서버 코드 보고가 없다. 체크인 판정·등급·집계는 전부 Next.js API에서 이뤄지고, 상태는 기존 SQLite에 테이블 6개를 추가해 저장한다.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · SQLite + Drizzle · Auth.js v5 (Google) · Tailwind 4 · Vitest · ESP32(Arduino/PlatformIO) + TFT_eSPI + QRCode

**Spec:** `docs/superpowers/specs/2026-08-21-study-time-tracking-design.md`

## Global Constraints

- 코드 슬롯 길이 **60초**. 서버는 **현재 슬롯과 직전 슬롯 2개**를 인정한다.
- 코드 길이 **6자**, 알파벳 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (Crockford base32 — I/L/O/U 제외).
- 코드 소각 단위는 **(슬롯, 멤버) 쌍**. 여러 명이 같은 QR을 동시에 스캔하는 것은 정상이다.
- `pending_scan` TTL **10분**. 재실 증명 시각은 **스캔 시각**이며 로그인 완료 시각이 아니다.
- 종료 없이 **10시간(36000초)** 초과 시 자동 마감 → `unresolved`. 이 규칙은 **종료 QR이 없는 세션에만** 적용한다.
- 집계 포함 상태: `confirmed`, `pending`, `approved`. 제외: `open`, `unresolved`, `rejected`.
- 장비 2대 = `room_id` 1(공학실습동 24214) · 2(학생회관 03324). 공작실(3번)은 장비 없음 — 1번으로 집계된다.
- 시드 대상은 **세부팀이 배정된 전기팀원 58명**. 스터디 시트는 최신본을 쓴다(repo 사본은 5월 4일자로 오래됨). 명부의 연락처·학과·학기·복수전공은 **적재하지 않는다**.
- 세부팀 4종 고정: `계기 및 데이터` `배터리 및 전원` `배선 및 하네스` `토크 벡터링`.
- 세부팀 색상(라이트 고정): `#2a78d6` / `#eb6834` / `#1baf7a` / `#4a3aa7`.
- 시각은 전부 **초 단위 Unix timestamp(integer)**. 기존 `reservations` 규약과 동일하다.
- 컨테이너 시간대는 `Asia/Seoul` 고정(기존 `8886c84`에서 확정된 제약).
- 학번 원장 CSV는 `data/` 아래에만 두며 repo에 커밋하지 않는다(`data`는 이미 `.gitignore`).

---

### Task 1: 멤버 스키마와 학번 원장 시드

**Files:**
- Create: `vitest.config.ts`
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/roster-to-csv.py`
- Create: `src/lib/db/seed-members.ts`
- Modify: `package.json` (scripts에 `seed:members` 추가)
- Test: `src/lib/db/members.test.ts`
- Create: `src/lib/db/members.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `schema.members` 테이블, `getMemberByEmail(email: string): Member | null`, `getMemberByStudentNo(no: string): Member | null`, `claimMember(args): ClaimResult`, `listMembers(): Member[]`, `type Member`, `type SubTeam`

- [ ] **Step 1: vitest 경로 별칭 설정**

기존 테스트는 상대경로만 써서 `vitest.config.ts` 가 없다. 이 기능의 모듈들은 `@/lib/...` 로 서로를 참조하므로 별칭을 등록해야 테스트가 돈다. 이 프로젝트는 `"type": "module"` 이라 `__dirname` 을 쓸 수 없다.

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

Run: `npm test`
Expected: 기존 테스트가 그대로 PASS (별칭 추가가 기존 상대경로 import 를 깨지 않는다).

- [ ] **Step 2: 세부팀 상수 추가**

`src/lib/constants.ts` 끝에 추가한다:

```ts
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
```

- [ ] **Step 3: members 테이블을 스키마에 추가**

`src/lib/db/schema.ts` 끝에 추가한다:

```ts
export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  student_no: text("student_no").notNull().unique(),
  name: text("name").notNull(),
  sub_team: text("sub_team").notNull(),
  /** 구글 계정 클레임 전에는 null. 클레임 후 유일. */
  user_email: text("user_email").unique(),
  /** seeded = 원장에서 시드됨, pending = 원장에 없어 승인 대기 */
  status: text("status").notNull().default("seeded"),
  created_at: integer("created_at").notNull(),
});
```

- [ ] **Step 4: 마이그레이션 생성**

```bash
npm run db:generate
```

Expected: `drizzle/0002_*.sql` 생성. 파일을 열어 `CREATE TABLE \`members\``가 들어 있는지 확인한다.

- [ ] **Step 5: 실패하는 테스트 작성**

`src/lib/db/members.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const m = await import("./members");
const { db, schema } = await import("./index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("members", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0 },
      { student_no: "2022313526", name: "곽효건", sub_team: "배선 및 하네스", created_at: 0 },
    ]).run();
  });

  test("학번으로 조회", () => {
    expect(m.getMemberByStudentNo("2025312077")?.name).toBe("김도현");
    expect(m.getMemberByStudentNo("9999999999")).toBeNull();
  });

  test("클레임하면 이메일로 조회된다", () => {
    const r = m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    expect(r.ok).toBe(true);
    expect(m.getMemberByEmail("a@b.com")?.student_no).toBe("2025312077");
  });

  test("이미 클레임된 학번은 거절", () => {
    m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    const r = m.claimMember({ studentNo: "2025312077", email: "c@d.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("이미");
  });

  test("한 계정이 두 학번을 클레임할 수 없다", () => {
    m.claimMember({ studentNo: "2025312077", email: "a@b.com" });
    const r = m.claimMember({ studentNo: "2022313526", email: "a@b.com" });
    expect(r.ok).toBe(false);
  });

  test("원장에 없는 학번은 pending 멤버로 생성", () => {
    const r = m.claimMember({ studentNo: "2026999999", email: "n@b.com", name: "신입", subTeam: "토크 벡터링" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.status).toBe("pending");
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npm test -- src/lib/db/members.test.ts`
Expected: FAIL — `Cannot find module './members'`

- [ ] **Step 7: members.ts 구현**

`src/lib/db/members.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import type { SubTeam } from "@/lib/constants";

export type Member = typeof schema.members.$inferSelect;

export type ClaimResult =
  | { ok: true; member: Member }
  | { ok: false; error: string };

export function getMemberByEmail(email: string): Member | null {
  const rows = db.select().from(schema.members).where(eq(schema.members.user_email, email)).all();
  return rows[0] ?? null;
}

export function getMemberByStudentNo(no: string): Member | null {
  const rows = db.select().from(schema.members).where(eq(schema.members.student_no, no)).all();
  return rows[0] ?? null;
}

export function listMembers(): Member[] {
  return db.select().from(schema.members).all();
}

export function claimMember(args: {
  studentNo: string;
  email: string;
  name?: string;
  subTeam?: SubTeam;
}): ClaimResult {
  const already = getMemberByEmail(args.email);
  if (already) return { ok: false, error: "이 구글 계정은 이미 다른 학번에 연결되어 있습니다. 관리자에게 문의하세요." };

  const existing = getMemberByStudentNo(args.studentNo);
  if (existing) {
    if (existing.user_email) {
      return { ok: false, error: "이미 다른 계정이 클레임한 학번입니다. 관리자에게 문의하세요." };
    }
    db.update(schema.members)
      .set({ user_email: args.email })
      .where(eq(schema.members.id, existing.id))
      .run();
    return { ok: true, member: { ...existing, user_email: args.email } };
  }

  if (!args.name || !args.subTeam) {
    return { ok: false, error: "명부에 없는 학번입니다. 이름과 세부팀을 입력해주세요." };
  }
  const now = Math.floor(Date.now() / 1000);
  const row = db.insert(schema.members).values({
    student_no: args.studentNo,
    name: args.name,
    sub_team: args.subTeam,
    user_email: args.email,
    status: "pending",
    created_at: now,
  }).returning().all()[0];
  return { ok: true, member: row };
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test -- src/lib/db/members.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: 명부 xlsx → CSV 변환 스크립트**

`scripts/roster-to-csv.py`. 두 엑셀을 이름으로 조인해 **세부팀이 배정된 전기팀원만** 추출한다. 명부의 연락처·학과·학기는 읽지 않는다.

```python
"""명부 xlsx + 스터디 시트 xlsx → data/roster.csv (student_no,name,sub_team).

실행:
  uvx --from openpyxl python scripts/roster-to-csv.py <명부.xlsx> <스터디시트.xlsx>
"""
import sys, csv, pathlib
import openpyxl

roster_path, study_path = sys.argv[1], sys.argv[2]

wb = openpyxl.load_workbook(roster_path, data_only=True)
rows = [r for r in wb["시트1"].iter_rows(min_row=4, values_only=True)
        if r[0] and str(r[0]).strip() != "이름"]
# 학번 기준 dedupe. 임원이 직책 행과 정회원 행으로 2회 등재되어 있다.
elec = {}
for r in rows:
    if str(r[4]).strip() == "전기":
        elec[str(r[0]).strip()] = str(r[3]).replace(".0", "")

wb2 = openpyxl.load_workbook(study_path, data_only=True)
study = [(str(r[0]).strip(), r[1]) for r in wb2["총계"].iter_rows(min_row=3, values_only=True) if r[0]]

out = []
for name, team in study:
    if not team:
        continue          # 세부팀 미배정 제외
    if name not in elec:
        continue          # 명부에 없으면 제외
    out.append((elec[name], name, str(team).strip()))

pathlib.Path("data").mkdir(exist_ok=True)
with open("data/roster.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["student_no", "name", "sub_team"])
    w.writerows(out)
print(f"wrote data/roster.csv: {len(out)} members")
```

- [ ] **Step 10: 변환 실행 및 검증**

```bash
uvx --from openpyxl python scripts/roster-to-csv.py "$HOME/Downloads/2026년 1학기 헤븐 활동 회원 명부.xlsx" "$HOME/Downloads/2026 스터디 참여시간-3.xlsx"
```

Expected: `wrote data/roster.csv: 58 members`. 58이 아니면 멈추고 원인을 확인한다.

- [ ] **Step 11: 시드 스크립트 작성**

`src/lib/db/seed-members.ts`:

```ts
import fs from "node:fs";
import { db, schema } from "./index";
import { getMemberByStudentNo } from "./members";

const csvPath = process.env.ROSTER_CSV ?? "./data/roster.csv";
const text = fs.readFileSync(csvPath, "utf-8").trim();
const lines = text.split("\n").slice(1);
const now = Math.floor(Date.now() / 1000);

let added = 0;
for (const line of lines) {
  const [student_no, name, sub_team] = line.split(",").map((s) => s.trim());
  if (!student_no) continue;
  if (getMemberByStudentNo(student_no)) continue;
  db.insert(schema.members).values({ student_no, name, sub_team, status: "seeded", created_at: now }).run();
  added++;
}
console.log(`seed-members done: +${added}`);
```

`package.json`의 `scripts`에 추가한다:

```json
"seed:members": "tsx src/lib/db/seed-members.ts"
```

- [ ] **Step 12: 마이그레이션 + 시드 실행 확인**

```bash
npm run migrate && npm run seed:members
```

Expected: `seed-members done: +58`. 재실행하면 `+0` (멱등).

- [ ] **Step 13: 커밋**

```bash
git add src/lib/db/schema.ts src/lib/db/members.ts src/lib/db/members.test.ts src/lib/constants.ts src/lib/db/seed-members.ts scripts/roster-to-csv.py package.json drizzle/
git commit -m "feat: 멤버 테이블 + 학번 원장 시드 (전기팀 57명)"
```

---

### Task 2: QR 코드 생성·검증 모듈

**Files:**
- Create: `src/lib/attendance/code.ts`
- Test: `src/lib/attendance/code.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, DB 미사용)
- Produces: `slotNumber(ts: number): number`, `codeForSlot(secret: string, slot: number): string`, `verifyCode(code: string, ts: number, devices: Device[]): Match | null`, `loadDevices(): Device[]`, `type Device = { roomId: number; secret: string }`, `type Match = { roomId: number; slot: number }`, `SLOT_SECONDS`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/attendance/code.test.ts`:

```ts
import { expect, test, describe } from "vitest";
import { slotNumber, codeForSlot, verifyCode, SLOT_SECONDS } from "./code";

const devices = [
  { roomId: 1, secret: "secret-room-1" },
  { roomId: 2, secret: "secret-room-2" },
];

describe("code", () => {
  test("슬롯은 60초 단위", () => {
    expect(slotNumber(0)).toBe(0);
    expect(slotNumber(59)).toBe(0);
    expect(slotNumber(60)).toBe(1);
    expect(SLOT_SECONDS).toBe(60);
  });

  test("코드는 6자, 허용 알파벳만 사용", () => {
    const c = codeForSlot("secret-room-1", 12345);
    expect(c).toHaveLength(6);
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  test("같은 시크릿·슬롯이면 같은 코드", () => {
    expect(codeForSlot("s", 7)).toBe(codeForSlot("s", 7));
  });

  test("시크릿이 다르면 코드가 다르다", () => {
    expect(codeForSlot("secret-room-1", 7)).not.toBe(codeForSlot("secret-room-2", 7));
  });

  test("현재 슬롯 코드를 검증하면 방이 나온다", () => {
    const ts = 1_700_000_000;
    const code = codeForSlot("secret-room-2", slotNumber(ts));
    expect(verifyCode(code, ts, devices)).toEqual({ roomId: 2, slot: slotNumber(ts) });
  });

  test("직전 슬롯 코드도 인정한다", () => {
    const ts = 1_700_000_000;
    const prev = codeForSlot("secret-room-1", slotNumber(ts) - 1);
    expect(verifyCode(prev, ts, devices)).toEqual({ roomId: 1, slot: slotNumber(ts) - 1 });
  });

  test("두 슬롯 이전 코드는 거절", () => {
    const ts = 1_700_000_000;
    const old = codeForSlot("secret-room-1", slotNumber(ts) - 2);
    expect(verifyCode(old, ts, devices)).toBeNull();
  });

  test("소문자 입력도 허용", () => {
    const ts = 1_700_000_000;
    const code = codeForSlot("secret-room-1", slotNumber(ts));
    expect(verifyCode(code.toLowerCase(), ts, devices)?.roomId).toBe(1);
  });

  test("엉터리 코드는 null", () => {
    expect(verifyCode("ZZZZZZ", 1_700_000_000, devices)).toBeNull();
    expect(verifyCode("", 1_700_000_000, devices)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/code.test.ts`
Expected: FAIL — `Cannot find module './code'`

- [ ] **Step 3: code.ts 구현**

`src/lib/attendance/code.ts`:

```ts
import { createHmac } from "node:crypto";

export const SLOT_SECONDS = 60;
export const CODE_LENGTH = 6;

/** Crockford base32 — I/L/O/U 제외. 손으로 옮겨 적을 때 헷갈리지 않게. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type Device = { roomId: number; secret: string };
export type Match = { roomId: number; slot: number };

export function slotNumber(ts: number): number {
  return Math.floor(ts / SLOT_SECONDS);
}

export function codeForSlot(secret: string, slot: number): string {
  const mac = createHmac("sha256", secret).update(String(slot)).digest();
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[mac[i] % ALPHABET.length];
  }
  return out;
}

/**
 * 현재 슬롯과 직전 슬롯을 장비 전체에 대조한다.
 * 카메라를 조준하는 사이 코드가 바뀌어 실패하는 것을 막기 위해 두 슬롯을 인정한다.
 */
export function verifyCode(code: string, ts: number, devices: Device[]): Match | null {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== CODE_LENGTH) return null;
  const now = slotNumber(ts);
  for (const slot of [now, now - 1]) {
    for (const d of devices) {
      if (codeForSlot(d.secret, slot) === normalized) return { roomId: d.roomId, slot };
    }
  }
  return null;
}

/**
 * `ATTENDANCE_DEVICE_SECRETS` 환경변수에서 장비 목록을 읽는다.
 * 형식: `1:시크릿1,2:시크릿2`
 */
export function loadDevices(): Device[] {
  const raw = process.env.ATTENDANCE_DEVICE_SECRETS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      return { roomId: Number(pair.slice(0, idx)), secret: pair.slice(idx + 1) };
    })
    .filter((d) => Number.isFinite(d.roomId) && d.secret.length > 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/code.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/attendance/
git commit -m "feat: QR 코드 TOTP 생성·검증 모듈"
```

---

### Task 3: 세션 스키마와 체크인·체크아웃

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/attendance/sessions.ts`
- Test: `src/lib/attendance/sessions.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Member`, Task 2의 `slotNumber`
- Produces: `openSession(args): OpenResult`, `closeSession(args): CloseResult`, `currentSession(memberId: number): StudySession | null`, `burnCode(memberId: number, slot: number): boolean`, `listSessionsByMember(memberId: number): StudySession[]`, `type StudySession`, `COUNTED_STATUSES`, `MAX_OPEN_SECONDS`

- [ ] **Step 1: 세션 관련 테이블 추가**

먼저 `src/lib/db/schema.ts` 첫 줄의 import 에 `real` 을 추가한다:

```ts
import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
```

그다음 파일 끝에 추가한다:

```ts
export const studySessions = sqliteTable("study_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  member_id: integer("member_id").notNull(),
  room_id: integer("room_id").notNull(),
  started_at: integer("started_at").notNull(),
  ended_at: integer("ended_at"),
  /** 'qr' 고정 — 시작은 QR 없이 불가능하다. */
  start_proof: text("start_proof").notNull(),
  /** 'qr' | 'manual' | null(진행중) */
  end_proof: text("end_proof"),
  /** open | confirmed | pending | approved | rejected | unresolved */
  status: text("status").notNull(),
  /** 본인 신고·관리자 처리 사유 */
  note: text("note"),
  /**
   * 보정 신고 시 첨부된 위치. 자동 승인 근거가 아니라 관리자 판단 재료다.
   * 실내 GPS 오차가 크고 위조가 쉬우므로 단독으로 시간을 인정하는 데 쓰지 않는다.
   */
  report_lat: real("report_lat"),
  report_lng: real("report_lng"),
  created_at: integer("created_at").notNull(),
});

export const usedCodes = sqliteTable("used_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  member_id: integer("member_id").notNull(),
  slot: integer("slot").notNull(),
  used_at: integer("used_at").notNull(),
});

export const pendingScans = sqliteTable("pending_scans", {
  id: text("id").primaryKey(),
  room_id: integer("room_id").notNull(),
  slot: integer("slot").notNull(),
  scanned_at: integer("scanned_at").notNull(),
  consumed_at: integer("consumed_at"),
});

export const sessionEdits = sqliteTable("session_edits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  session_id: integer("session_id").notNull(),
  editor_email: text("editor_email").notNull(),
  edited_at: integer("edited_at").notNull(),
  before_json: text("before_json").notNull(),
  after_json: text("after_json").notNull(),
  reason: text("reason"),
});

export const deviceHeartbeats = sqliteTable("device_heartbeats", {
  room_id: integer("room_id").primaryKey(),
  last_seen_at: integer("last_seen_at").notNull(),
  firmware: text("firmware"),
});
```

- [ ] **Step 2: 마이그레이션 생성**

```bash
npm run db:generate
```

Expected: `drizzle/0003_*.sql`에 5개 `CREATE TABLE`.

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/attendance/sessions.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("sessions", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.usedCodes).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("체크인하면 open 세션이 생긴다", () => {
    const r = s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(r.ok).toBe(true);
    expect(s.currentSession(1)?.status).toBe("open");
  });

  test("이미 진행 중이면 중복 체크인 거절", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.openSession({ memberId: 1, roomId: 1, ts: T0 + 10, slot: 101 });
    expect(r.ok).toBe(false);
  });

  test("QR 종료하면 confirmed", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "qr" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.status).toBe("confirmed");
      expect(r.session.ended_at).toBe(T0 + 3600);
    }
  });

  test("QR 없이 종료하면 pending", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.status).toBe("pending");
  });

  test("진행 중이 아니면 종료 실패", () => {
    expect(s.closeSession({ memberId: 1, ts: T0, proof: "qr" }).ok).toBe(false);
  });

  test("같은 (슬롯, 멤버)로는 두 번 소각할 수 없다", () => {
    expect(s.burnCode(1, 100, T0)).toBe(true);
    expect(s.burnCode(1, 100, T0)).toBe(false);
  });

  test("다른 멤버는 같은 슬롯을 소각할 수 있다", () => {
    db.insert(schema.members).values({
      id: 2, student_no: "2022313526", name: "곽효건", sub_team: "배선 및 하네스", created_at: 0,
    }).run();
    expect(s.burnCode(1, 100, T0)).toBe(true);
    expect(s.burnCode(2, 100, T0)).toBe(true);
  });

  test("QR 종료는 10시간을 넘어도 confirmed", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    const r = s.closeSession({ memberId: 1, ts: T0 + 12 * 3600, proof: "qr" });
    if (r.ok) expect(r.session.status).toBe("confirmed");
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/sessions.test.ts`
Expected: FAIL — `Cannot find module './sessions'`

- [ ] **Step 5: sessions.ts 구현**

`src/lib/attendance/sessions.ts`:

```ts
import { and, eq, desc, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";

export type StudySession = typeof schema.studySessions.$inferSelect;

/** 누적 시간 집계에 포함되는 상태. */
export const COUNTED_STATUSES = ["confirmed", "pending", "approved"] as const;

/** 종료 없이 이 시간을 넘기면 자동 마감된다. */
export const MAX_OPEN_SECONDS = 10 * 3600;

export type OpenResult = { ok: true; session: StudySession } | { ok: false; error: string };
export type CloseResult = { ok: true; session: StudySession } | { ok: false; error: string };

export function currentSession(memberId: number): StudySession | null {
  const rows = db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.member_id, memberId), eq(schema.studySessions.status, "open")))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
  return rows[0] ?? null;
}

export function listSessionsByMember(memberId: number): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(eq(schema.studySessions.member_id, memberId))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
}

/** (슬롯, 멤버) 쌍 소각. 이미 쓴 조합이면 false. */
export function burnCode(memberId: number, slot: number, ts: number): boolean {
  const dup = db.select().from(schema.usedCodes)
    .where(and(eq(schema.usedCodes.member_id, memberId), eq(schema.usedCodes.slot, slot)))
    .all();
  if (dup.length > 0) return false;
  db.insert(schema.usedCodes).values({ member_id: memberId, slot, used_at: ts }).run();
  return true;
}

export function openSession(args: {
  memberId: number; roomId: number; ts: number; slot: number;
}): OpenResult {
  if (currentSession(args.memberId)) {
    return { ok: false, error: "이미 진행 중인 스터디가 있습니다. 먼저 종료해주세요." };
  }
  const row = db.insert(schema.studySessions).values({
    member_id: args.memberId,
    room_id: args.roomId,
    started_at: args.ts,
    ended_at: null,
    start_proof: "qr",
    end_proof: null,
    status: "open",
    created_at: args.ts,
  }).returning().all()[0];
  return { ok: true, session: row };
}

export function closeSession(args: {
  memberId: number; ts: number; proof: "qr" | "manual"; note?: string;
  lat?: number; lng?: number;
}): CloseResult {
  const open = currentSession(args.memberId);
  if (!open) return { ok: false, error: "진행 중인 스터디가 없습니다." };
  if (args.ts <= open.started_at) return { ok: false, error: "종료 시각이 시작 시각보다 빠릅니다." };

  const status = args.proof === "qr" ? "confirmed" : "pending";
  const patch = {
    ended_at: args.ts,
    end_proof: args.proof,
    status,
    note: args.note ?? null,
    report_lat: args.lat ?? null,
    report_lng: args.lng ?? null,
  };
  db.update(schema.studySessions).set(patch).where(eq(schema.studySessions.id, open.id)).run();
  return { ok: true, session: { ...open, ...patch } };
}

export function listOpenSessions(): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.status, "open"), isNull(schema.studySessions.ended_at)))
    .all();
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/sessions.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/db/schema.ts src/lib/attendance/sessions.ts src/lib/attendance/sessions.test.ts drizzle/
git commit -m "feat: 스터디 세션 스키마 + 체크인/체크아웃"
```

---

### Task 4: 10시간 자동 마감과 본인 신고

**Files:**
- Modify: `src/lib/attendance/sessions.ts`
- Test: `src/lib/attendance/autoclose.test.ts`

**Interfaces:**
- Consumes: Task 3의 `listOpenSessions`, `MAX_OPEN_SECONDS`, `StudySession`
- Produces: `autoCloseStale(now: number): number`, `reportEndTime(args): CloseResult`, `reviewSession(args): CloseResult`, `recordEdit(args): void`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/attendance/autoclose.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("자동 마감", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.sessionEdits).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("10시간 이내면 마감하지 않는다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(s.autoCloseStale(T0 + 9 * 3600)).toBe(0);
    expect(s.currentSession(1)?.status).toBe("open");
  });

  test("10시간 초과하면 unresolved 로 마감", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(s.autoCloseStale(T0 + 10 * 3600 + 1)).toBe(1);
    expect(s.currentSession(1)).toBeNull();
    const row = s.listSessionsByMember(1)[0];
    expect(row.status).toBe("unresolved");
    expect(row.ended_at).toBe(T0 + s.MAX_OPEN_SECONDS);
  });

  test("unresolved 는 집계에서 빠진다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const row = s.listSessionsByMember(1)[0];
    expect(s.COUNTED_STATUSES).not.toContain(row.status);
  });

  test("본인이 종료 시각을 신고하면 pending 이 된다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    const r = s.reportEndTime({ sessionId: id, memberId: 1, endedAt: T0 + 4 * 3600, note: "19시 퇴실", editorEmail: "a@b.com" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.status).toBe("pending");
      expect(r.session.ended_at).toBe(T0 + 4 * 3600);
    }
  });

  test("남의 세션은 신고할 수 없다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    expect(s.reportEndTime({ sessionId: id, memberId: 999, endedAt: T0 + 100, editorEmail: "x@y.com" }).ok).toBe(false);
  });

  test("신고 시각이 시작보다 빠르면 거절", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.autoCloseStale(T0 + 11 * 3600);
    const id = s.listSessionsByMember(1)[0].id;
    expect(s.reportEndTime({ sessionId: id, memberId: 1, endedAt: T0 - 10, editorEmail: "a@b.com" }).ok).toBe(false);
  });

  test("관리자 승인하면 approved, 거부하면 rejected", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    const id = s.listSessionsByMember(1)[0].id;
    const a = s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    if (a.ok) expect(a.session.status).toBe("approved");
    const r = s.reviewSession({ sessionId: id, approve: false, editorEmail: "admin@b.com", reason: "미참석" });
    if (r.ok) expect(r.session.status).toBe("rejected");
  });

  test("수정 이력이 남는다", () => {
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    s.closeSession({ memberId: 1, ts: T0 + 3600, proof: "manual" });
    const id = s.listSessionsByMember(1)[0].id;
    s.reviewSession({ sessionId: id, approve: true, editorEmail: "admin@b.com" });
    expect(s.listEdits(id)).toHaveLength(1);
    expect(s.listEdits(id)[0].editor_email).toBe("admin@b.com");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/autoclose.test.ts`
Expected: FAIL — `s.autoCloseStale is not a function`

- [ ] **Step 3: sessions.ts 에 추가 구현**

`src/lib/attendance/sessions.ts` 끝에 추가한다:

```ts
export type SessionEdit = typeof schema.sessionEdits.$inferSelect;

/** 원본 시각을 덮어쓰지 않고 변경 이력을 별도 행으로 쌓는다. */
export function recordEdit(args: {
  sessionId: number; editorEmail: string; before: StudySession; after: StudySession; reason?: string;
}): void {
  db.insert(schema.sessionEdits).values({
    session_id: args.sessionId,
    editor_email: args.editorEmail,
    edited_at: Math.floor(Date.now() / 1000),
    before_json: JSON.stringify(args.before),
    after_json: JSON.stringify(args.after),
    reason: args.reason ?? null,
  }).run();
}

export function listEdits(sessionId: number): SessionEdit[] {
  return db.select().from(schema.sessionEdits)
    .where(eq(schema.sessionEdits.session_id, sessionId))
    .all();
}

export function getSession(id: number): StudySession | null {
  const rows = db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id)).all();
  return rows[0] ?? null;
}

/**
 * 종료 QR 없이 10시간을 넘긴 세션을 unresolved 로 마감한다.
 * 종료 시각은 시작 + 10시간으로 두되 집계에서는 빠지므로, 본인 신고 전까지 시간은 인정되지 않는다.
 * 정상적으로 QR 종료한 세션은 10시간을 넘겨도 이 함수의 대상이 아니다(status 가 이미 open 이 아님).
 */
export function autoCloseStale(now: number): number {
  const stale = listOpenSessions().filter((r) => now - r.started_at > MAX_OPEN_SECONDS);
  for (const row of stale) {
    db.update(schema.studySessions)
      .set({ ended_at: row.started_at + MAX_OPEN_SECONDS, end_proof: null, status: "unresolved" })
      .where(eq(schema.studySessions.id, row.id))
      .run();
  }
  return stale.length;
}

/** unresolved 세션에 대해 본인이 종료 시각을 신고한다 → pending(승인 대기). */
export function reportEndTime(args: {
  sessionId: number; memberId: number; endedAt: number; editorEmail: string; note?: string;
}): CloseResult {
  const before = getSession(args.sessionId);
  if (!before) return { ok: false, error: "세션을 찾을 수 없습니다." };
  if (before.member_id !== args.memberId) return { ok: false, error: "본인 기록만 신고할 수 있습니다." };
  if (before.status !== "unresolved") return { ok: false, error: "미확정 상태의 기록만 신고할 수 있습니다." };
  if (args.endedAt <= before.started_at) return { ok: false, error: "종료 시각이 시작 시각보다 빠릅니다." };

  const after = { ...before, ended_at: args.endedAt, end_proof: "manual", status: "pending", note: args.note ?? null };
  db.update(schema.studySessions)
    .set({ ended_at: args.endedAt, end_proof: "manual", status: "pending", note: args.note ?? null })
    .where(eq(schema.studySessions.id, args.sessionId))
    .run();
  recordEdit({ sessionId: args.sessionId, editorEmail: args.editorEmail, before, after, reason: args.note });
  return { ok: true, session: after };
}

/** 관리자가 pending 세션을 승인/거부한다. */
export function reviewSession(args: {
  sessionId: number; approve: boolean; editorEmail: string; reason?: string;
}): CloseResult {
  const before = getSession(args.sessionId);
  if (!before) return { ok: false, error: "세션을 찾을 수 없습니다." };
  const status = args.approve ? "approved" : "rejected";
  const after = { ...before, status };
  db.update(schema.studySessions).set({ status }).where(eq(schema.studySessions.id, args.sessionId)).run();
  recordEdit({ sessionId: args.sessionId, editorEmail: args.editorEmail, before, after, reason: args.reason });
  return { ok: true, session: after };
}

export function listPendingReview(): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(eq(schema.studySessions.status, "pending"))
    .orderBy(desc(schema.studySessions.started_at))
    .all();
}

export function listUnresolvedByMember(memberId: number): StudySession[] {
  return db.select().from(schema.studySessions)
    .where(and(eq(schema.studySessions.member_id, memberId), eq(schema.studySessions.status, "unresolved")))
    .all();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/autoclose.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/attendance/
git commit -m "feat: 10시간 자동 마감 + 본인 신고 + 관리자 승인"
```

---

### Task 5: 집계 (누적 시간·순위·히트맵 데이터)

**Files:**
- Create: `src/lib/attendance/aggregate.ts`
- Test: `src/lib/attendance/aggregate.test.ts`

**Interfaces:**
- Consumes: Task 3의 `COUNTED_STATUSES`, Task 1의 `Member`
- Produces: `memberTotals(opts?): Ranking[]`, `dailyBuckets(memberId: number, fromTs: number, toTs: number): Record<string, number>`, `teamDailyBuckets(fromTs, toTs): Record<SubTeam, Record<string, number>>`, `type Ranking = { member: Member; rawSeconds: number; countedSeconds: number; sessionCount: number; adjustedCount: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/attendance/aggregate.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const a = await import("./aggregate");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

function addSession(memberId: number, start: number, end: number, status: string) {
  db.insert(schema.studySessions).values({
    member_id: memberId, room_id: 1, started_at: start, ended_at: end,
    start_proof: "qr", end_proof: "qr", status, created_at: start,
  }).run();
}

describe("aggregate", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values([
      { id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0 },
      { id: 2, student_no: "2", name: "나", sub_team: "계기 및 데이터", created_at: 0 },
    ]).run();
  });

  test("confirmed 만 있으면 그대로 합산", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "confirmed");
    const r = a.memberTotals();
    expect(r[0].countedSeconds).toBe(7200);
    expect(r[0].sessionCount).toBe(2);
  });

  test("unresolved / rejected 는 제외", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "unresolved");
    addSession(1, T0 + 14400, T0 + 18000, "rejected");
    expect(a.memberTotals()[0].countedSeconds).toBe(3600);
  });

  test("pending / approved 는 포함되고 보정 건수로 센다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(1, T0 + 7200, T0 + 10800, "pending");
    addSession(1, T0 + 14400, T0 + 18000, "approved");
    const r = a.memberTotals()[0];
    expect(r.countedSeconds).toBe(10800);
    expect(r.adjustedCount).toBe(2);
  });

  test("누적 시간 내림차순으로 정렬", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(2, T0, T0 + 7200, "confirmed");
    const r = a.memberTotals();
    expect(r[0].member.id).toBe(2);
    expect(r[1].member.id).toBe(1);
  });

  test("주간 상한을 주면 상한 전/후가 모두 나온다", () => {
    addSession(1, T0, T0 + 10 * 3600, "confirmed");
    const r = a.memberTotals({ weeklyCapSeconds: 5 * 3600 })[0];
    expect(r.rawSeconds).toBe(10 * 3600);
    expect(r.countedSeconds).toBe(5 * 3600);
  });

  test("기록 없는 멤버는 목록에 없다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    expect(a.memberTotals().map((r) => r.member.id)).toEqual([1]);
  });

  test("dailyBuckets 는 날짜별 초를 준다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    const b = a.dailyBuckets(1, T0 - 86400, T0 + 86400);
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(3600);
  });

  test("teamDailyBuckets 는 세부팀별로 나뉜다", () => {
    addSession(1, T0, T0 + 3600, "confirmed");
    addSession(2, T0, T0 + 7200, "confirmed");
    const t = a.teamDailyBuckets(T0 - 86400, T0 + 86400);
    expect(Object.values(t["토크 벡터링"]).reduce((x, y) => x + y, 0)).toBe(3600);
    expect(Object.values(t["계기 및 데이터"]).reduce((x, y) => x + y, 0)).toBe(7200);
    expect(Object.keys(t["배선 및 하네스"] ?? {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/aggregate.test.ts`
Expected: FAIL — `Cannot find module './aggregate'`

- [ ] **Step 3: aggregate.ts 구현**

`src/lib/attendance/aggregate.ts`:

```ts
import { db, schema } from "@/lib/db/index";
import { COUNTED_STATUSES } from "./sessions";
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
  for (const [memberId, rawSeconds] of raw) {
    const member = byId.get(memberId);
    if (!member) continue;
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
  out.sort((a, b) => b.countedSeconds - a.countedSeconds);
  return out;
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
    if (!team || !out[team]) continue;
    const k = dateKey(r.started_at);
    out[team][k] = (out[team][k] ?? 0) + ((r.ended_at as number) - r.started_at);
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/aggregate.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/attendance/aggregate.ts src/lib/attendance/aggregate.test.ts
git commit -m "feat: 누적 시간·순위·히트맵 집계"
```

---

### Task 6: 스캔 진입점 `/c/[code]` 와 pending scan

**Files:**
- Create: `src/lib/attendance/scan.ts`
- Create: `src/app/c/[code]/page.tsx`
- Create: `src/app/api/attendance/scan/route.ts`
- Test: `src/lib/attendance/scan.test.ts`

**Interfaces:**
- Consumes: Task 2의 `verifyCode`/`loadDevices`, Task 3의 `openSession`/`closeSession`/`burnCode`/`currentSession`, Task 1의 `getMemberByEmail`
- Produces: `createPendingScan(match, ts): string`, `consumePendingScan(id: string, ts: number): PendingScan | null`, `PENDING_TTL_SECONDS`, `applyScan(args): ScanOutcome`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/attendance/scan.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const sc = await import("./scan");
const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("scan", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.pendingScans).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.usedCodes).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "2025312077", name: "김도현", sub_team: "토크 벡터링", user_email: "a@b.com", created_at: 0,
    }).run();
  });

  test("pending scan 은 10분 안에 소비 가능", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 60)?.room_id).toBe(1);
  });

  test("10분이 지나면 소비 불가", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + sc.PENDING_TTL_SECONDS + 1)).toBeNull();
  });

  test("한 번 소비하면 재사용 불가", () => {
    const id = sc.createPendingScan({ roomId: 1, slot: 100 }, T0);
    expect(sc.consumePendingScan(id, T0 + 10)).not.toBeNull();
    expect(sc.consumePendingScan(id, T0 + 20)).toBeNull();
  });

  test("진행 중이 없으면 체크인, 있으면 체크아웃", () => {
    const first = sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 });
    expect(first.kind).toBe("checked_in");
    const second = sc.applyScan({ memberId: 1, roomId: 1, slot: 101, ts: T0 + 3600 });
    expect(second.kind).toBe("checked_out");
    if (second.kind === "checked_out") expect(second.session.status).toBe("confirmed");
  });

  test("같은 슬롯을 두 번 쓰면 거절", () => {
    sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 });
    const again = sc.applyScan({ memberId: 1, roomId: 1, slot: 100, ts: T0 + 5 });
    expect(again.kind).toBe("error");
  });

  test("스캔 시각이 기록된다 — 나중에 적용해도 시각은 스캔 시점", () => {
    const id = sc.createPendingScan({ roomId: 2, slot: 100 }, T0);
    const p = sc.consumePendingScan(id, T0 + 300);
    expect(p?.scanned_at).toBe(T0);
    const r = sc.applyScan({ memberId: 1, roomId: p!.room_id, slot: p!.slot, ts: p!.scanned_at });
    if (r.kind === "checked_in") expect(r.session.started_at).toBe(T0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/scan.test.ts`
Expected: FAIL — `Cannot find module './scan'`

- [ ] **Step 3: scan.ts 구현**

`src/lib/attendance/scan.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";
import { burnCode, closeSession, currentSession, openSession, type StudySession } from "./sessions";

export const PENDING_TTL_SECONDS = 600;

export type PendingScan = typeof schema.pendingScans.$inferSelect;

export type ScanOutcome =
  | { kind: "checked_in"; session: StudySession }
  | { kind: "checked_out"; session: StudySession }
  | { kind: "error"; error: string };

/** 로그인 전 스캔을 보관한다. 재실 증명 시각은 이 시점으로 고정된다. */
export function createPendingScan(match: { roomId: number; slot: number }, ts: number): string {
  const id = randomUUID();
  db.insert(schema.pendingScans).values({
    id, room_id: match.roomId, slot: match.slot, scanned_at: ts, consumed_at: null,
  }).run();
  return id;
}

export function consumePendingScan(id: string, ts: number): PendingScan | null {
  const rows = db.select().from(schema.pendingScans)
    .where(and(eq(schema.pendingScans.id, id), isNull(schema.pendingScans.consumed_at)))
    .all();
  const row = rows[0];
  if (!row) return null;
  if (ts - row.scanned_at > PENDING_TTL_SECONDS) return null;
  db.update(schema.pendingScans).set({ consumed_at: ts }).where(eq(schema.pendingScans.id, id)).run();
  return row;
}

/** 진행 중인 세션이 없으면 체크인, 있으면 체크아웃. 코드는 (슬롯, 멤버) 단위로 소각된다. */
export function applyScan(args: {
  memberId: number; roomId: number; slot: number; ts: number;
}): ScanOutcome {
  if (!burnCode(args.memberId, args.slot, args.ts)) {
    return { kind: "error", error: "이미 사용한 코드입니다. 화면의 새 QR을 다시 스캔해주세요." };
  }
  const open = currentSession(args.memberId);
  if (!open) {
    const r = openSession({ memberId: args.memberId, roomId: args.roomId, ts: args.ts, slot: args.slot });
    return r.ok ? { kind: "checked_in", session: r.session } : { kind: "error", error: r.error };
  }
  const r = closeSession({ memberId: args.memberId, ts: args.ts, proof: "qr" });
  return r.ok ? { kind: "checked_out", session: r.session } : { kind: "error", error: r.error };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/scan.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 스캔 진입 페이지 작성**

`src/app/c/[code]/page.tsx`. 서버 컴포넌트에서 코드를 즉시 검증하고 pending scan을 만든 뒤, 로그인·온보딩 상태에 따라 분기한다.

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { loadDevices, verifyCode } from "@/lib/attendance/code";
import { createPendingScan } from "@/lib/attendance/scan";
import { getMemberByEmail } from "@/lib/db/members";
import ScanClient from "@/components/attendance/ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ts = Math.floor(Date.now() / 1000);
  const match = verifyCode(code, ts, loadDevices());

  if (!match) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl">코드가 만료되었습니다</h1>
        <p className="mt-2 text-slate-600">동방 화면의 새 QR을 다시 스캔해주세요.</p>
      </main>
    );
  }

  // 코드 검증은 여기서 끝난다. 이후 로그인·온보딩에 시간이 걸려도 증명 시각은 지금이다.
  const pendingId = createPendingScan(match, ts);

  const user = await getSessionUser();
  if (!user) redirect(`/api/auth/signin?callbackUrl=/c/apply/${pendingId}`);

  const member = getMemberByEmail(user.email);
  if (!member) redirect(`/onboarding?pending=${pendingId}`);

  return <ScanClient pendingId={pendingId} memberName={member.name} />;
}
```

- [ ] **Step 6: pending 적용 API 작성**

`src/app/api/attendance/scan/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { applyScan, consumePendingScan } from "@/lib/attendance/scan";
import { autoCloseStale } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록이 필요합니다" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const pendingId = body?.pendingId;
  if (typeof pendingId !== "string") return NextResponse.json({ error: "pendingId 필요" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  autoCloseStale(now);

  const pending = consumePendingScan(pendingId, now);
  if (!pending) return NextResponse.json({ error: "스캔이 만료되었습니다. QR을 다시 스캔해주세요." }, { status: 410 });

  const outcome = applyScan({
    memberId: member.id,
    roomId: pending.room_id,
    slot: pending.slot,
    ts: pending.scanned_at,
  });
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: 400 });
  return NextResponse.json({ kind: outcome.kind, session: outcome.session });
}
```

- [ ] **Step 7: ScanClient 컴포넌트 작성**

`src/components/attendance/ScanClient.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type State =
  | { s: "loading" }
  | { s: "done"; kind: "checked_in" | "checked_out"; startedAt: number; endedAt: number | null }
  | { s: "error"; message: string };

export default function ScanClient({ pendingId, memberName }: { pendingId: string; memberName: string }) {
  const [state, setState] = useState<State>({ s: "loading" });

  useEffect(() => {
    fetch("/api/attendance/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) return setState({ s: "error", message: j.error ?? "처리에 실패했습니다." });
        setState({ s: "done", kind: j.kind, startedAt: j.session.started_at, endedAt: j.session.ended_at });
      })
      .catch(() => setState({ s: "error", message: "네트워크 오류입니다." }));
  }, [pendingId]);

  if (state.s === "loading") return <main className="mx-auto max-w-md p-6">처리 중…</main>;
  if (state.s === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl">기록하지 못했습니다</h1>
        <p className="mt-2 text-slate-600">{state.message}</p>
        <a className="mt-4 inline-block underline" href="/study">내 스터디 현황</a>
      </main>
    );
  }

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const mins = state.endedAt ? Math.round((state.endedAt - state.startedAt) / 60) : 0;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl">{state.kind === "checked_in" ? "스터디 시작" : "스터디 종료"}</h1>
      <p className="mt-2 text-slate-700">
        {memberName} · {fmt(state.startedAt)}
        {state.endedAt ? ` – ${fmt(state.endedAt)} (${Math.floor(mins / 60)}시간 ${mins % 60}분)` : ""}
      </p>
      <a className="mt-6 inline-block underline" href="/study">내 스터디 현황 보기</a>
    </main>
  );
}
```

- [ ] **Step 8: 로그인 후 복귀 경로 작성**

`src/app/c/apply/[pending]/page.tsx`. 로그인 리디렉션에서 돌아왔을 때 pending을 적용한다.

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import ScanClient from "@/components/attendance/ScanClient";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ pending: string }> }) {
  const { pending } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/api/auth/signin?callbackUrl=/c/apply/${pending}`);

  const member = getMemberByEmail(user.email);
  if (!member) redirect(`/onboarding?pending=${pending}`);

  return <ScanClient pendingId={pending} memberName={member.name} />;
}
```

- [ ] **Step 9: 빌드 확인**

Run: `npm run build`
Expected: 성공. `/c/[code]`, `/c/apply/[pending]` 라우트가 목록에 나온다.

- [ ] **Step 10: 커밋**

```bash
git add src/lib/attendance/scan.ts src/lib/attendance/scan.test.ts src/app/c src/app/api/attendance src/components/attendance
git commit -m "feat: QR 스캔 진입점 + pending scan (로그인 전 스캔 시각 보존)"
```

---

### Task 7: 온보딩 (학번 바인딩) 과 세션 유지

**Files:**
- Modify: `src/auth.ts`
- Create: `src/app/onboarding/page.tsx`
- Create: `src/components/attendance/OnboardingForm.tsx`
- Create: `src/app/api/attendance/claim/route.ts`

**Interfaces:**
- Consumes: Task 1의 `claimMember`/`getMemberByStudentNo`/`getMemberByEmail`
- Produces: `/onboarding` 화면, `POST /api/attendance/claim`

- [ ] **Step 1: Auth.js 세션을 1년으로 연장**

`src/auth.ts`의 `NextAuth({...})` 설정을 다음으로 교체한다. 쿠키는 서버가 `Set-Cookie`로 httpOnly 발급하므로 iOS Safari ITP의 7일 만료(JS 설정 쿠키 대상) 대상이 아니다.

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
});
```

- [ ] **Step 2: 학번 조회 + 클레임 API 작성**

`src/app/api/attendance/claim/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { claimMember, getMemberByStudentNo } from "@/lib/db/members";
import { SUB_TEAMS } from "@/lib/constants";

/** 학번으로 원장을 조회한다. 확인 화면에 이름·세부팀을 보여주기 위한 것. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const no = req.nextUrl.searchParams.get("studentNo") ?? "";
  const m = getMemberByStudentNo(no);
  if (!m) return NextResponse.json({ found: false });
  if (m.user_email) return NextResponse.json({ found: true, taken: true });
  return NextResponse.json({ found: true, taken: false, name: m.name, subTeam: m.sub_team });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const studentNo = String(body?.studentNo ?? "").trim();
  if (!/^\d{10}$/.test(studentNo)) {
    return NextResponse.json({ error: "학번 10자리를 입력해주세요." }, { status: 400 });
  }
  const subTeam = body?.subTeam;
  if (subTeam !== undefined && !SUB_TEAMS.includes(subTeam)) {
    return NextResponse.json({ error: "세부팀이 올바르지 않습니다." }, { status: 400 });
  }

  const r = claimMember({
    studentNo,
    email: user.email,
    name: body?.name ? String(body.name).trim() : undefined,
    subTeam,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, member: r.member });
}
```

- [ ] **Step 3: 온보딩 폼 컴포넌트 작성**

`src/components/attendance/OnboardingForm.tsx`. 학번 입력 → 조회 → 확인 2단계. 원장에 없으면 이름·세부팀 입력으로 확장된다.

```tsx
"use client";

import { useState } from "react";
import { SUB_TEAMS } from "@/lib/constants";

type Found = { name: string; subTeam: string } | { unknown: true } | null;

export default function OnboardingForm({ pending }: { pending: string | null }) {
  const [studentNo, setStudentNo] = useState("");
  const [found, setFound] = useState<Found>(null);
  const [name, setName] = useState("");
  const [subTeam, setSubTeam] = useState<string>(SUB_TEAMS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setError("");
    if (!/^\d{10}$/.test(studentNo)) return setError("학번 10자리를 입력해주세요.");
    setBusy(true);
    const r = await fetch(`/api/attendance/claim?studentNo=${studentNo}`);
    const j = await r.json();
    setBusy(false);
    if (j.taken) return setError("이미 다른 계정이 등록한 학번입니다. 관리자에게 문의하세요.");
    setFound(j.found ? { name: j.name, subTeam: j.subTeam } : { unknown: true });
  }

  async function confirm() {
    setError("");
    setBusy(true);
    const payload: Record<string, string> = { studentNo };
    if (found && "unknown" in found) {
      if (!name.trim()) { setBusy(false); return setError("이름을 입력해주세요."); }
      payload.name = name;
      payload.subTeam = subTeam;
    }
    const r = await fetch("/api/attendance/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "등록에 실패했습니다.");
    window.location.href = pending ? `/c/apply/${pending}` : "/study";
  }

  return (
    <div className="space-y-4">
      {!found && (
        <>
          <label className="block">
            <span className="text-sm text-slate-600">학번</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              inputMode="numeric"
              value={studentNo}
              onChange={(e) => { setStudentNo(e.target.value.replace(/\D/g, "")); setError(""); }}
              placeholder="2025312077"
            />
          </label>
          <button className="w-full rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={lookup}>
            확인
          </button>
        </>
      )}

      {found && "name" in found && (
        <>
          <p className="text-lg">
            <strong>{found.name}</strong> · {found.subTeam}, 맞나요?
          </p>
          <div className="flex gap-2">
            <button className="flex-1 rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={confirm}>
              맞습니다
            </button>
            <button className="flex-1 rounded border px-4 py-2" onClick={() => { setFound(null); setStudentNo(""); }}>
              다시 입력
            </button>
          </div>
        </>
      )}

      {found && "unknown" in found && (
        <>
          <p className="text-sm text-slate-600">명부에 없는 학번입니다. 직접 입력하면 관리자 승인 후 정식 등록됩니다.</p>
          <label className="block">
            <span className="text-sm text-slate-600">이름</span>
            <input className="mt-1 w-full rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">세부팀</span>
            <select className="mt-1 w-full rounded border px-3 py-2" value={subTeam} onChange={(e) => setSubTeam(e.target.value)}>
              {SUB_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="w-full rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={confirm}>
            등록
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: 온보딩 페이지 작성**

`src/app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import OnboardingForm from "@/components/attendance/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: { searchParams: Promise<{ pending?: string }> }) {
  const { pending } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/onboarding");

  const member = getMemberByEmail(user.email);
  if (member) redirect(pending ? `/c/apply/${pending}` : "/study");

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl">학번 등록</h1>
      <p className="mt-2 mb-6 text-slate-600">스터디 시간 기록에 한 번만 필요합니다.</p>
      <OnboardingForm pending={pending ?? null} />
    </main>
  );
}
```

- [ ] **Step 5: 수동 확인**

Run: `npm run dev` 후 브라우저에서 `/onboarding` 접속.
Expected: 로그인되어 있고 미등록이면 학번 입력 화면. 시드된 학번(예: `data/roster.csv`의 첫 행)을 넣으면 이름·세부팀 확인 문구가 뜬다. 이미 등록된 학번을 넣으면 "이미 다른 계정이 등록한 학번입니다".

- [ ] **Step 6: 커밋**

```bash
git add src/auth.ts src/app/onboarding src/app/api/attendance/claim src/components/attendance/OnboardingForm.tsx
git commit -m "feat: 학번 온보딩 + 세션 1년 유지"
```

---

### Task 8: 진행 중 배너와 인앱 브라우저 경고

**Files:**
- Create: `src/components/attendance/ActiveSessionBanner.tsx`
- Create: `src/components/attendance/InAppBrowserNotice.tsx`
- Create: `src/app/api/attendance/session/route.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: Task 3의 `currentSession`/`closeSession`, Task 4의 `autoCloseStale`
- Produces: `GET /api/attendance/session`, `POST /api/attendance/session`(수동 종료 = 보정 신고), 전역 배너

- [ ] **Step 1: 현재 세션 조회·수동 종료 API**

`src/app/api/attendance/session/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { autoCloseStale, closeSession, currentSession } from "@/lib/attendance/sessions";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ session: null });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ session: null });

  autoCloseStale(Math.floor(Date.now() / 1000));
  return NextResponse.json({ session: currentSession(member.id), memberName: member.name });
}

/** QR 없는 수동 종료 = 보정 신고. pending 상태로 들어가 관리자 승인을 기다린다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록 필요" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note : undefined;
  const lat = Number.isFinite(Number(body?.lat)) ? Number(body.lat) : undefined;
  const lng = Number.isFinite(Number(body?.lng)) ? Number(body.lng) : undefined;
  const r = closeSession({
    memberId: member.id, ts: Math.floor(Date.now() / 1000), proof: "manual", note, lat, lng,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, session: r.session });
}
```

- [ ] **Step 2: 배너 컴포넌트 작성**

`src/components/attendance/ActiveSessionBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Session = { id: number; started_at: number; room_id: number };

const ROOM_NAMES: Record<number, string> = {
  1: "공학실습동 24214",
  2: "학생회관 03324",
  3: "공작실 24112A",
};

export default function ActiveSessionBanner() {
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    fetch("/api/attendance/session").then((r) => r.json()).then((j) => setSession(j.session));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!session) return null;

  const elapsed = Math.max(0, now - session.started_at);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);

  /** 위치는 best-effort 첨부다. 거부하거나 실패해도 종료는 그대로 진행된다. */
  function coords(): Promise<{ lat?: number; lng?: number }> {
    if (!navigator.geolocation) return Promise.resolve({});
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 5000, maximumAge: 60_000 },
      );
    });
  }

  async function stop() {
    if (!confirm("QR 없이 종료하면 보정 신고로 기록되어 관리자 승인이 필요합니다. 종료할까요?")) return;
    const where = await coords();
    const r = await fetch("/api/attendance/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(where),
    });
    if (r.ok) setSession(null);
  }

  return (
    <div className="flex items-center gap-3 bg-sky-50 px-4 py-2 text-sm">
      <span className="font-medium text-sky-900">스터디 중</span>
      <span className="text-sky-800">{ROOM_NAMES[session.room_id] ?? "동방"} · {h}시간 {m}분</span>
      <button className="ml-auto rounded border border-sky-700 px-3 py-1 text-sky-900" onClick={stop}>
        종료
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 인앱 브라우저 안내 컴포넌트 작성**

`src/components/attendance/InAppBrowserNotice.tsx`. 카카오톡 등의 웹뷰는 쿠키 저장소가 분리되어 매번 재로그인이 발생한다.

```tsx
"use client";

import { useEffect, useState } from "react";

export default function InAppBrowserNotice() {
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setInApp(/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua));
  }, []);

  if (!inApp) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
      인앱 브라우저에서는 로그인이 유지되지 않습니다. 기본 카메라 앱으로 QR을 스캔하거나, 이 페이지를 외부 브라우저로 열어주세요.
    </div>
  );
}
```

- [ ] **Step 4: 레이아웃에 붙이기**

`src/app/layout.tsx`의 `<body>`를 다음으로 교체한다:

```tsx
      <body>
        <InAppBrowserNotice />
        <ActiveSessionBanner />
        {children}
      </body>
```

파일 상단에 import를 추가한다:

```tsx
import ActiveSessionBanner from "@/components/attendance/ActiveSessionBanner";
import InAppBrowserNotice from "@/components/attendance/InAppBrowserNotice";
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/components/attendance src/app/api/attendance/session src/app/layout.tsx
git commit -m "feat: 진행 중 배너 + 인앱 브라우저 안내"
```

---

### Task 9: 개인 스터디 현황 화면

**Files:**
- Create: `src/app/study/page.tsx`
- Create: `src/components/attendance/ContributionGrid.tsx`
- Create: `src/components/attendance/UnresolvedReport.tsx`
- Create: `src/app/api/attendance/report/route.ts`

**Interfaces:**
- Consumes: Task 5의 `dailyBuckets`/`memberTotals`, Task 3의 `listSessionsByMember`, Task 4의 `listUnresolvedByMember`/`reportEndTime`/`listEdits`
- Produces: `/study` 화면, `ContributionGrid` 컴포넌트(Task 10에서 재사용), `POST /api/attendance/report`

- [ ] **Step 1: 잔디 그래프 컴포넌트 작성**

`src/components/attendance/ContributionGrid.tsx`. 팀 히트맵에서도 색만 바꿔 재사용한다.

```tsx
type Props = {
  /** 날짜(YYYY-MM-DD) → 초 */
  buckets: Record<string, number>;
  /** 표시할 주 수 */
  weeks: number;
  /** 최댓값 색상. 농도는 이 색과 배경의 혼합으로 만든다. */
  color: string;
  cell?: number;
};

const LEVELS = [0, 0.25, 0.5, 0.75, 1];

function key(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ContributionGrid({ buckets, weeks, color, cell = 12 }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 이번 주 일요일부터 거슬러 올라간다.
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const days: { k: string; sec: number }[] = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = key(d);
    days.push({ k, sec: buckets[k] ?? 0 });
  }

  const max = Math.max(1, ...days.map((d) => d.sec));

  function bg(sec: number): string {
    if (sec <= 0) return "transparent";
    const ratio = sec / max;
    const level = LEVELS.reduce((acc, l) => (ratio >= l ? l : acc), 0.25);
    return `color-mix(in oklab, ${color} ${Math.round(Math.max(level, 0.25) * 100)}%, white)`;
  }

  const cols: { k: string; sec: number }[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(days.slice(w * 7, w * 7 + 7));

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((d) => (
            <div
              key={d.k}
              title={`${d.k} · ${(d.sec / 3600).toFixed(1)}시간`}
              style={{
                width: cell,
                height: cell,
                borderRadius: 3,
                background: bg(d.sec),
                border: d.sec <= 0 ? "0.5px solid #e2e8f0" : "none",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 미확정 신고 API 작성**

`src/app/api/attendance/report/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { reportEndTime } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const member = getMemberByEmail(user.email);
  if (!member) return NextResponse.json({ error: "학번 등록 필요" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  const endedAt = Number(body?.endedAt);
  if (!Number.isFinite(sessionId) || !Number.isFinite(endedAt)) {
    return NextResponse.json({ error: "sessionId/endedAt 필요" }, { status: 400 });
  }

  const r = reportEndTime({
    sessionId,
    memberId: member.id,
    endedAt,
    editorEmail: user.email,
    note: typeof body?.note === "string" ? body.note : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 미확정 신고 폼 작성**

`src/components/attendance/UnresolvedReport.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function UnresolvedReport({ sessionId, startedAt }: { sessionId: number; startedAt: number }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!value) return setError("종료 시각을 입력해주세요.");
    const endedAt = Math.floor(new Date(value).getTime() / 1000);
    if (!Number.isFinite(endedAt)) return setError("시각 형식이 올바르지 않습니다.");
    if (endedAt <= startedAt) return setError("시작 시각보다 뒤여야 합니다.");

    const r = await fetch("/api/attendance/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, endedAt }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "신고에 실패했습니다.");
    window.location.reload();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        className="rounded border px-2 py-1 text-sm"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(""); }}
      />
      <button className="rounded border px-3 py-1 text-sm" onClick={submit}>종료 시각 신고</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: 개인 현황 페이지 작성**

`src/app/study/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { listSessionsByMember, listEdits } from "@/lib/attendance/sessions";
import { dailyBuckets, memberTotals } from "@/lib/attendance/aggregate";
import { weekStart } from "@/lib/week";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import ContributionGrid from "@/components/attendance/ContributionGrid";
import UnresolvedReport from "@/components/attendance/UnresolvedReport";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "진행 중",
  confirmed: "QR 종료",
  pending: "보정 승인 대기",
  approved: "보정 승인됨",
  rejected: "거부됨",
  unresolved: "미확정 · 신고 필요",
};

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function StudyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/study");
  const member = getMemberByEmail(user.email);
  if (!member) redirect("/onboarding");

  const now = Math.floor(Date.now() / 1000);
  const sessions = listSessionsByMember(member.id);
  const totals = memberTotals().find((t) => t.member.id === member.id);
  const buckets = dailyBuckets(member.id, now - 26 * 7 * 86400, now);
  const thisWeek = weekStart(now);
  const weekSeconds = sessions
    .filter((s) => s.ended_at && s.started_at >= thisWeek && ["confirmed", "pending", "approved"].includes(s.status))
    .reduce((acc, s) => acc + ((s.ended_at as number) - s.started_at), 0);

  const color = SUB_TEAM_COLORS[member.sub_team as SubTeam] ?? "#2a78d6";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">{member.name} · {member.sub_team}</h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">누적</div>
          <div className="text-2xl">{((totals?.countedSeconds ?? 0) / 3600).toFixed(1)}시간</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">이번 주</div>
          <div className="text-2xl">{(weekSeconds / 3600).toFixed(1)}시간</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-sm text-slate-500">보정 건수</div>
          <div className="text-2xl">{totals?.adjustedCount ?? 0}건</div>
        </div>
      </div>

      <h2 className="mt-8 mb-2 text-sm text-slate-500">최근 26주</h2>
      <ContributionGrid buckets={buckets} weeks={26} color={color} />

      <h2 className="mt-8 mb-2 text-sm text-slate-500">기록</h2>
      <ul className="divide-y">
        {sessions.map((s) => {
          const edits = listEdits(s.id);
          return (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{fmt(s.started_at)}{s.ended_at ? ` – ${fmt(s.ended_at)}` : ""}</span>
                <span className="text-slate-600">
                  {s.ended_at ? `${(((s.ended_at as number) - s.started_at) / 3600).toFixed(1)}h` : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{STATUS_LABEL[s.status] ?? s.status}</span>
              </div>
              {s.status === "unresolved" && <UnresolvedReport sessionId={s.id} startedAt={s.started_at} />}
              {edits.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {edits.map((e) => (
                    <li key={e.id}>
                      {fmt(e.edited_at)} · {e.editor_email} 수정{e.reason ? ` — ${e.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공. `/study` 라우트가 목록에 나온다.

- [ ] **Step 6: 커밋**

```bash
git add src/app/study src/components/attendance/ContributionGrid.tsx src/components/attendance/UnresolvedReport.tsx src/app/api/attendance/report
git commit -m "feat: 개인 스터디 현황 화면 (잔디·기록·수정 이력·미확정 신고)"
```

---

### Task 10: 순위표와 팀 히트맵

**Files:**
- Create: `src/app/study/ranking/page.tsx`
- Create: `src/app/study/teams/page.tsx`
- Create: `src/lib/attendance/settings.ts`
- Test: `src/lib/attendance/settings.test.ts`
- Modify: `src/lib/db/schema.ts`

**Interfaces:**
- Consumes: Task 5의 `memberTotals`/`teamDailyBuckets`, Task 9의 `ContributionGrid`
- Produces: `getSetting(key: string): string | null`, `setSetting(key: string, value: string): void`, `getWeeklyCapSeconds(): number | null`, `getEntryQuota(): number | null`, `/study/ranking`, `/study/teams`

- [ ] **Step 1: 설정 테이블 추가**

`src/lib/db/schema.ts` 끝에 추가한다:

```ts
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

Run: `npm run db:generate`
Expected: `drizzle/0004_*.sql`에 `CREATE TABLE \`settings\``.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/attendance/settings.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const st = await import("./settings");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("settings", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.settings).run();
  });

  test("없으면 null", () => {
    expect(st.getSetting("nope")).toBeNull();
    expect(st.getWeeklyCapSeconds()).toBeNull();
    expect(st.getEntryQuota()).toBeNull();
  });

  test("설정하면 읽힌다", () => {
    st.setSetting("weekly_cap_hours", "20");
    expect(st.getWeeklyCapSeconds()).toBe(20 * 3600);
  });

  test("덮어쓰기 가능", () => {
    st.setSetting("entry_quota", "30");
    st.setSetting("entry_quota", "25");
    expect(st.getEntryQuota()).toBe(25);
  });

  test("숫자가 아니면 null", () => {
    st.setSetting("weekly_cap_hours", "abc");
    expect(st.getWeeklyCapSeconds()).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`

- [ ] **Step 4: settings.ts 구현**

`src/lib/attendance/settings.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";

export function getSetting(key: string): string | null {
  const rows = db.select().from(schema.settings).where(eq(schema.settings.key, key)).all();
  return rows[0]?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const existing = getSetting(key);
  if (existing === null) {
    db.insert(schema.settings).values({ key, value }).run();
  } else {
    db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key)).run();
  }
}

function numeric(key: string): number | null {
  const raw = getSetting(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 주간 인정 시간 상한. 미설정이면 null(상한 없음). */
export function getWeeklyCapSeconds(): number | null {
  const hours = numeric("weekly_cap_hours");
  return hours === null ? null : hours * 3600;
}

/** 엔트리 정원. 순위표의 컷 라인. */
export function getEntryQuota(): number | null {
  return numeric("entry_quota");
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/settings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 순위표 페이지 작성**

`src/app/study/ranking/page.tsx`:

```tsx
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import { memberTotals } from "@/lib/attendance/aggregate";
import { getEntryQuota, getWeeklyCapSeconds } from "@/lib/attendance/settings";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const user = await getSessionUser();
  const me = user ? getMemberByEmail(user.email) : null;

  const cap = getWeeklyCapSeconds();
  const quota = getEntryQuota();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">스터디 시간 순위</h1>
      <p className="mt-2 text-sm text-slate-600">
        영광 대회 엔트리 순서 기준입니다.
        {cap ? ` 주간 인정 상한 ${(cap / 3600).toFixed(0)}시간이 적용되어 있습니다.` : ""}
      </p>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2 w-12">#</th>
            <th className="py-2">이름</th>
            <th className="py-2">세부팀</th>
            <th className="py-2 text-right">인정 시간</th>
            {cap && <th className="py-2 text-right">상한 전</th>}
            <th className="py-2 text-right">보정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = me?.id === r.member.id;
            const cut = quota !== null && i + 1 === quota;
            return (
              <tr
                key={r.member.id}
                className={`border-t ${isMe ? "bg-sky-50 font-medium" : ""} ${cut ? "border-b-2 border-b-red-400" : ""}`}
              >
                <td className="py-2">{i + 1}</td>
                <td className="py-2">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                    style={{ background: SUB_TEAM_COLORS[r.member.sub_team as SubTeam] ?? "#94a3b8" }}
                  />
                  {r.member.name}
                </td>
                <td className="py-2 text-slate-600">{r.member.sub_team}</td>
                <td className="py-2 text-right">{(r.countedSeconds / 3600).toFixed(1)}h</td>
                {cap && (
                  <td className="py-2 text-right text-slate-400">
                    {r.rawSeconds !== r.countedSeconds ? `${(r.rawSeconds / 3600).toFixed(1)}h` : "—"}
                  </td>
                )}
                <td className="py-2 text-right text-slate-500">
                  {r.adjustedCount > 0 ? `${r.adjustedCount}/${r.sessionCount}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {quota !== null && (
        <p className="mt-4 text-sm text-slate-500">빨간 선이 엔트리 정원 {quota}명 컷입니다.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 7: 팀 히트맵 페이지 작성**

`src/app/study/teams/page.tsx`. 하나의 그리드에 팀 색을 섞지 않고 스몰 멀티플로 나눈다.

```tsx
import { teamDailyBuckets, memberTotals } from "@/lib/attendance/aggregate";
import { SUB_TEAMS, SUB_TEAM_COLORS } from "@/lib/constants";
import ContributionGrid from "@/components/attendance/ContributionGrid";

export const dynamic = "force-dynamic";

const WEEKS = 18;

export default async function TeamsPage() {
  const now = Math.floor(Date.now() / 1000);
  const buckets = teamDailyBuckets(now - WEEKS * 7 * 86400, now);
  const totals = memberTotals();

  const teamHours: Record<string, number> = {};
  for (const t of SUB_TEAMS) teamHours[t] = 0;
  for (const r of totals) {
    if (teamHours[r.member.sub_team] !== undefined) {
      teamHours[r.member.sub_team] += r.countedSeconds / 3600;
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">세부팀별 스터디 현황</h1>
      <p className="mt-2 text-sm text-slate-600">최근 {WEEKS}주. 팀마다 자기 색의 농담으로 강도를 표시합니다.</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {SUB_TEAMS.map((t) => (
          <section key={t}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SUB_TEAM_COLORS[t] }} />
              <span>{t}</span>
              <span className="ml-auto text-sm text-slate-500">{teamHours[t].toFixed(0)}h</span>
            </div>
            <ContributionGrid buckets={buckets[t]} weeks={WEEKS} color={SUB_TEAM_COLORS[t]} cell={9} />
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 성공. `/study/ranking`, `/study/teams` 라우트가 나온다.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/attendance/settings.ts src/lib/attendance/settings.test.ts src/app/study/ranking src/app/study/teams src/lib/db/schema.ts drizzle/
git commit -m "feat: 순위표(엔트리 컷) + 세부팀 히트맵"
```

---

### Task 11: 하트비트 API 와 장비 상태

**Files:**
- Create: `src/app/api/attendance/heartbeat/route.ts`
- Create: `src/lib/attendance/devices.ts`
- Test: `src/lib/attendance/devices.test.ts`

**Interfaces:**
- Consumes: Task 2의 `loadDevices`, Task 3의 `listOpenSessions`
- Produces: `recordHeartbeat(roomId: number, ts: number, firmware?: string): void`, `deviceStatuses(now: number): DeviceStatus[]`, `occupancy(roomId: number): number`, `OFFLINE_AFTER_SECONDS`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/attendance/devices.test.ts`:

```ts
import { expect, test, describe, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.ATTENDANCE_DEVICE_SECRETS = "1:aaa,2:bbb";

const d = await import("./devices");
const s = await import("./sessions");
const { db, schema } = await import("@/lib/db/index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const T0 = 1_700_000_000;

describe("devices", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.deviceHeartbeats).run();
    db.delete(schema.studySessions).run();
    db.delete(schema.members).run();
    db.insert(schema.members).values({
      id: 1, student_no: "1", name: "가", sub_team: "토크 벡터링", created_at: 0,
    }).run();
  });

  test("하트비트가 없으면 오프라인", () => {
    const st = d.deviceStatuses(T0);
    expect(st).toHaveLength(2);
    expect(st[0].online).toBe(false);
    expect(st[0].lastSeenAt).toBeNull();
  });

  test("최근 하트비트가 있으면 온라인", () => {
    d.recordHeartbeat(1, T0, "v1");
    const st = d.deviceStatuses(T0 + 60);
    expect(st.find((x) => x.roomId === 1)?.online).toBe(true);
    expect(st.find((x) => x.roomId === 2)?.online).toBe(false);
  });

  test("오래된 하트비트는 오프라인", () => {
    d.recordHeartbeat(1, T0);
    expect(d.deviceStatuses(T0 + d.OFFLINE_AFTER_SECONDS + 1)[0].online).toBe(false);
  });

  test("하트비트는 덮어쓴다", () => {
    d.recordHeartbeat(1, T0);
    d.recordHeartbeat(1, T0 + 300);
    expect(d.deviceStatuses(T0 + 310).find((x) => x.roomId === 1)?.lastSeenAt).toBe(T0 + 300);
  });

  test("재실 인원은 진행 중 세션 수", () => {
    expect(d.occupancy(1)).toBe(0);
    s.openSession({ memberId: 1, roomId: 1, ts: T0, slot: 100 });
    expect(d.occupancy(1)).toBe(1);
    expect(d.occupancy(2)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/attendance/devices.test.ts`
Expected: FAIL — `Cannot find module './devices'`

- [ ] **Step 3: devices.ts 구현**

`src/lib/attendance/devices.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/index";
import { loadDevices } from "./code";
import { listOpenSessions } from "./sessions";

/** 장비는 5분마다 하트비트를 보낸다. 두 번 연속 놓치면 오프라인으로 본다. */
export const OFFLINE_AFTER_SECONDS = 15 * 60;

export type DeviceStatus = {
  roomId: number;
  online: boolean;
  lastSeenAt: number | null;
  firmware: string | null;
  occupancy: number;
};

export function recordHeartbeat(roomId: number, ts: number, firmware?: string): void {
  const rows = db.select().from(schema.deviceHeartbeats)
    .where(eq(schema.deviceHeartbeats.room_id, roomId)).all();
  if (rows.length === 0) {
    db.insert(schema.deviceHeartbeats)
      .values({ room_id: roomId, last_seen_at: ts, firmware: firmware ?? null }).run();
  } else {
    db.update(schema.deviceHeartbeats)
      .set({ last_seen_at: ts, firmware: firmware ?? rows[0].firmware })
      .where(eq(schema.deviceHeartbeats.room_id, roomId)).run();
  }
}

export function occupancy(roomId: number): number {
  return listOpenSessions().filter((s) => s.room_id === roomId).length;
}

export function deviceStatuses(now: number): DeviceStatus[] {
  const beats = new Map(
    db.select().from(schema.deviceHeartbeats).all().map((b) => [b.room_id, b]),
  );
  return loadDevices().map((d) => {
    const b = beats.get(d.roomId);
    return {
      roomId: d.roomId,
      online: b ? now - b.last_seen_at <= OFFLINE_AFTER_SECONDS : false,
      lastSeenAt: b?.last_seen_at ?? null,
      firmware: b?.firmware ?? null,
      occupancy: occupancy(d.roomId),
    };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/lib/attendance/devices.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 하트비트 API 작성**

`src/app/api/attendance/heartbeat/route.ts`. 장비는 로그인이 없으므로 코드 자체를 인증 수단으로 쓴다 — 유효한 현재 코드를 보낼 수 있다는 것이 곧 시크릿 보유 증명이다.

```ts
import { NextRequest, NextResponse } from "next/server";
import { loadDevices, verifyCode } from "@/lib/attendance/code";
import { occupancy, recordHeartbeat } from "@/lib/attendance/devices";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "");
  const now = Math.floor(Date.now() / 1000);

  const match = verifyCode(code, now, loadDevices());
  if (!match) return NextResponse.json({ error: "invalid code" }, { status: 401 });

  recordHeartbeat(match.roomId, now, body?.firmware ? String(body.firmware) : undefined);
  return NextResponse.json({ ok: true, occupancy: occupancy(match.roomId), serverTime: now });
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/attendance/devices.ts src/lib/attendance/devices.test.ts src/app/api/attendance/heartbeat
git commit -m "feat: 장비 하트비트 + 재실 인원 응답"
```

---

### Task 12: 관리자 화면

**Files:**
- Create: `src/app/admin/study/page.tsx`
- Create: `src/components/attendance/ReviewButtons.tsx`
- Create: `src/components/attendance/SettingsForm.tsx`
- Create: `src/app/api/attendance/review/route.ts`
- Create: `src/app/api/attendance/settings/route.ts`
- Create: `src/app/api/attendance/export/route.ts`

**Interfaces:**
- Consumes: Task 4의 `listPendingReview`/`reviewSession`, Task 10의 `getSetting`/`setSetting`, Task 11의 `deviceStatuses`, Task 5의 `memberTotals`
- Produces: `/admin/study` 화면, `POST /api/attendance/review`, `POST /api/attendance/settings`, `GET /api/attendance/export`

- [ ] **Step 1: 승인/거부 API 작성**

`src/app/api/attendance/review/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { reviewSession } from "@/lib/attendance/sessions";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  if (!Number.isFinite(sessionId)) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });

  const r = reviewSession({
    sessionId,
    approve: Boolean(body?.approve),
    editorEmail: user.email,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 설정 API 작성**

`src/app/api/attendance/settings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getSetting, setSetting } from "@/lib/attendance/settings";

const ALLOWED = new Set(["weekly_cap_hours", "entry_quota"]);

export async function GET() {
  return NextResponse.json({
    weekly_cap_hours: getSetting("weekly_cap_hours"),
    entry_quota: getSetting("entry_quota"),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "알 수 없는 설정" }, { status: 400 });

  const value = String(body?.value ?? "").trim();
  if (value !== "" && !Number.isFinite(Number(value))) {
    return NextResponse.json({ error: "숫자를 입력해주세요." }, { status: 400 });
  }
  setSetting(key, value);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: CSV 내보내기 API 작성**

`src/app/api/attendance/export/route.ts`. 기존 xlsx 운영과 이어지도록 이름·세부팀·시간 컬럼을 낸다.

```ts
import { NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { memberTotals } from "@/lib/attendance/aggregate";
import { getWeeklyCapSeconds } from "@/lib/attendance/settings";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const cap = getWeeklyCapSeconds();
  const rows = memberTotals(cap ? { weeklyCapSeconds: cap } : undefined);
  const lines = ["이름,세부팀,작업시간(hr),상한전(hr),세션수,보정건수"];
  for (const r of rows) {
    lines.push([
      r.member.name,
      r.member.sub_team,
      (r.countedSeconds / 3600).toFixed(1),
      (r.rawSeconds / 3600).toFixed(1),
      String(r.sessionCount),
      String(r.adjustedCount),
    ].join(","));
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="study-hours.csv"',
    },
  });
}
```

- [ ] **Step 4: 승인 버튼 컴포넌트 작성**

`src/components/attendance/ReviewButtons.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function ReviewButtons({ sessionId }: { sessionId: number }) {
  const [busy, setBusy] = useState(false);

  async function send(approve: boolean) {
    const reason = approve ? undefined : (prompt("거부 사유(선택)") ?? undefined);
    setBusy(true);
    const r = await fetch("/api/attendance/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, approve, reason }),
    });
    setBusy(false);
    if (r.ok) window.location.reload();
    else alert("처리에 실패했습니다.");
  }

  return (
    <span className="flex gap-2">
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(true)}>승인</button>
      <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => send(false)}>거부</button>
    </span>
  );
}
```

- [ ] **Step 5: 설정 폼 컴포넌트 작성**

`src/components/attendance/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function SettingsForm({ initial }: { initial: { weekly_cap_hours: string; entry_quota: string } }) {
  const [cap, setCap] = useState(initial.weekly_cap_hours);
  const [quota, setQuota] = useState(initial.entry_quota);
  const [msg, setMsg] = useState("");

  async function save(key: string, value: string) {
    setMsg("");
    const r = await fetch("/api/attendance/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const j = await r.json();
    setMsg(r.ok ? "저장했습니다." : (j.error ?? "저장에 실패했습니다."));
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="block">
        <span className="text-sm text-slate-600">주간 인정 상한(시간)</span>
        <div className="mt-1 flex gap-2">
          <input className="w-28 rounded border px-2 py-1" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="없음" />
          <button className="rounded border px-3 py-1" onClick={() => save("weekly_cap_hours", cap)}>저장</button>
        </div>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">엔트리 정원(명)</span>
        <div className="mt-1 flex gap-2">
          <input className="w-28 rounded border px-2 py-1" value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="없음" />
          <button className="rounded border px-3 py-1" onClick={() => save("entry_quota", quota)}>저장</button>
        </div>
      </label>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 6: 관리자 페이지 작성**

`src/app/admin/study/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { listPendingReview } from "@/lib/attendance/sessions";
import { listMembers } from "@/lib/db/members";
import { deviceStatuses } from "@/lib/attendance/devices";
import { getSetting } from "@/lib/attendance/settings";
import ReviewButtons from "@/components/attendance/ReviewButtons";
import SettingsForm from "@/components/attendance/SettingsForm";

export const dynamic = "force-dynamic";

function fmt(ts: number | null) {
  if (ts === null) return "—";
  return new Date(ts * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminStudyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/admin/study");
  if (!user.isAdmin) redirect("/");

  const now = Math.floor(Date.now() / 1000);
  const pending = listPendingReview();
  const members = new Map(listMembers().map((m) => [m.id, m]));
  const devices = deviceStatuses(now);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">스터디 시간 관리</h1>

      <h2 className="mt-8 mb-2 text-lg">장비 상태</h2>
      <ul className="divide-y">
        {devices.map((d) => (
          <li key={d.roomId} className="flex items-center gap-3 py-2">
            <span className={d.online ? "text-emerald-700" : "text-red-700"}>{d.online ? "온라인" : "오프라인"}</span>
            <span>{d.roomId}번 방</span>
            <span className="text-slate-500">최종 수신 {fmt(d.lastSeenAt)}</span>
            <span className="ml-auto text-slate-600">재실 {d.occupancy}명</span>
          </li>
        ))}
        {devices.length === 0 && <li className="py-2 text-slate-500">ATTENDANCE_DEVICE_SECRETS 가 설정되지 않았습니다.</li>}
      </ul>

      <h2 className="mt-8 mb-2 text-lg">승인 대기 {pending.length}건</h2>
      <ul className="divide-y">
        {pending.map((s) => {
          const offlineTag = devices.find((d) => d.roomId === s.room_id && !d.online);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {members.get(s.member_id)?.name ?? `#${s.member_id}`} · {fmt(s.started_at)} – {fmt(s.ended_at)}
                {s.note ? ` · ${s.note}` : ""}
                {offlineTag && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">장비 장애</span>}
                {s.report_lat !== null && s.report_lng !== null && (
                  <a
                    className="ml-2 text-xs underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps?q=${s.report_lat},${s.report_lng}`}
                  >
                    위치
                  </a>
                )}
              </span>
              <ReviewButtons sessionId={s.id} />
            </li>
          );
        })}
        {pending.length === 0 && <li className="py-2 text-slate-500">없습니다.</li>}
      </ul>

      <h2 className="mt-8 mb-2 text-lg">설정</h2>
      <SettingsForm
        initial={{
          weekly_cap_hours: getSetting("weekly_cap_hours") ?? "",
          entry_quota: getSetting("entry_quota") ?? "",
        }}
      />

      <h2 className="mt-8 mb-2 text-lg">내보내기</h2>
      <a className="underline" href="/api/attendance/export">누적 시간 CSV 다운로드</a>
    </main>
  );
}
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 8: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 예약 테스트 포함).

- [ ] **Step 9: 커밋**

```bash
git add src/app/admin/study src/app/api/attendance/review src/app/api/attendance/settings src/app/api/attendance/export src/components/attendance/ReviewButtons.tsx src/components/attendance/SettingsForm.tsx
git commit -m "feat: 관리자 화면 (승인 큐·장비 상태·설정·CSV 내보내기)"
```

---

### Task 13: ESP32 펌웨어

**Files:**
- Create: `firmware/study-qr/platformio.ini`
- Create: `firmware/study-qr/src/main.cpp`
- Create: `firmware/study-qr/src/config.h.example`
- Create: `firmware/study-qr/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 2의 코드 스킴(HMAC-SHA256(secret, String(slot)) → base32 6자), Task 11의 `POST /api/attendance/heartbeat`
- Produces: 장비 펌웨어. 서버와의 계약은 코드 알파벳·슬롯 길이·URL 형식이다.

- [ ] **Step 1: PlatformIO 설정 작성**

`firmware/study-qr/platformio.ini`:

```ini
[env:lolin_d32]
platform = espressif32
board = lolin_d32
framework = arduino
monitor_speed = 115200
lib_deps =
    bodmer/TFT_eSPI@^2.5.43
    ricmoo/QRCode@^0.0.1
build_flags =
    -DUSER_SETUP_LOADED=1
    -DILI9341_DRIVER=1
    -DTFT_WIDTH=240
    -DTFT_HEIGHT=320
    -DTFT_MISO=-1
    -DTFT_MOSI=23
    -DTFT_SCLK=18
    -DTFT_CS=5
    -DTFT_DC=2
    -DTFT_RST=4
    -DTFT_BL=15
    -DLOAD_GLCD=1
    -DSPI_FREQUENCY=40000000
```

- [ ] **Step 2: 설정 헤더 예시 작성**

`firmware/study-qr/src/config.h.example`:

```cpp
#pragma once

// 실제 값을 채워 config.h 로 복사한다. config.h 는 커밋하지 않는다.
#define WIFI_SSID       "heven"
#define WIFI_PASSWORD   "..."

// 서버의 ATTENDANCE_DEVICE_SECRETS 에 등록한 이 장비의 시크릿
#define DEVICE_SECRET   "change-me"

// 화면 상단에 표시할 방 이름
#define ROOM_NAME       "공학실습동 24214"

// QR 에 담을 베이스 URL. 짧을수록 QR 모듈 수가 줄어 스캔이 쉬워진다.
#define BASE_URL        "https://omo.tail0d4a7c.ts.net/c/"

#define HEARTBEAT_URL   "https://omo.tail0d4a7c.ts.net/api/attendance/heartbeat"
#define FIRMWARE_VER    "study-qr-1.0.0"
```

- [ ] **Step 3: 펌웨어 본체 작성**

`firmware/study-qr/src/main.cpp`:

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <TFT_eSPI.h>
#include <qrcode.h>
#include <mbedtls/md.h>
#include <time.h>

#include "config.h"

// 서버 src/lib/attendance/code.ts 와 반드시 동일해야 한다.
static const char *ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
static const int SLOT_SECONDS = 60;
static const int CODE_LENGTH = 6;

static TFT_eSPI tft = TFT_eSPI();
static long lastSlot = -1;
static unsigned long lastHeartbeat = 0;
static int occupancy = -1;
static bool timeReady = false;

static void codeForSlot(long slot, char *out) {
  char slotStr[24];
  snprintf(slotStr, sizeof(slotStr), "%ld", slot);

  uint8_t mac[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, (const uint8_t *)DEVICE_SECRET, strlen(DEVICE_SECRET));
  mbedtls_md_hmac_update(&ctx, (const uint8_t *)slotStr, strlen(slotStr));
  mbedtls_md_hmac_finish(&ctx, mac);
  mbedtls_md_free(&ctx);

  for (int i = 0; i < CODE_LENGTH; i++) out[i] = ALPHABET[mac[i] % 32];
  out[CODE_LENGTH] = '\0';
}

static void drawHeader() {
  tft.fillRect(0, 0, 240, 24, TFT_WHITE);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(ROOM_NAME, 120, 6, 2);
}

static void drawFooter(const char *code) {
  tft.fillRect(0, 268, 240, 52, TFT_WHITE);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("기본 카메라로 스캔", 120, 270, 2);

  char line[48];
  if (occupancy >= 0) snprintf(line, sizeof(line), "%s  |  현재 %d명", code, occupancy);
  else snprintf(line, sizeof(line), "%s", code);
  tft.drawString(line, 120, 294, 2);
}

/** 시각이 틀리면 코드가 전부 어긋난다. 틀린 QR 을 띄우느니 아무것도 띄우지 않는다. */
static void drawTimeError() {
  tft.fillScreen(TFT_WHITE);
  tft.setTextColor(TFT_RED, TFT_WHITE);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("시각 동기화 실패", 120, 140, 4);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.drawString("보정 신고로 기록해주세요", 120, 175, 2);
}

static void drawQr(const char *code) {
  char url[128];
  snprintf(url, sizeof(url), "%s%s", BASE_URL, code);

  QRCode qr;
  uint8_t data[qrcode_getBufferSize(4)];
  qrcode_initText(&qr, data, 4, ECC_LOW, url);

  const int avail = 232;
  const int scale = avail / qr.size;
  const int size = qr.size * scale;
  const int ox = (240 - size) / 2;
  const int oy = 28 + (236 - size) / 2;

  tft.fillRect(0, 24, 240, 244, TFT_WHITE);
  for (uint8_t y = 0; y < qr.size; y++) {
    for (uint8_t x = 0; x < qr.size; x++) {
      if (qrcode_getModule(&qr, x, y)) {
        tft.fillRect(ox + x * scale, oy + y * scale, scale, scale, TFT_BLACK);
      }
    }
  }
}

static bool syncTime() {
  configTzTime("KST-9", "pool.ntp.org", "time.google.com");
  struct tm info;
  if (!getLocalTime(&info, 10000)) return false;
  return time(nullptr) > 1700000000;
}

static void sendHeartbeat(const char *code) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(HEARTBEAT_URL);
  http.addHeader("Content-Type", "application/json");
  char body[160];
  snprintf(body, sizeof(body), "{\"code\":\"%s\",\"firmware\":\"%s\"}", code, FIRMWARE_VER);
  int status = http.POST(body);
  if (status == 200) {
    String payload = http.getString();
    int idx = payload.indexOf("\"occupancy\":");
    if (idx >= 0) occupancy = payload.substring(idx + 12).toInt();
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_WHITE);
  drawHeader();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) delay(500);

  timeReady = syncTime();
  if (!timeReady) drawTimeError();
}

void loop() {
  // 1시간마다 재동기화. RTC 가 없어 드리프트가 누적된다.
  static unsigned long lastSync = 0;
  if (millis() - lastSync > 3600UL * 1000UL) {
    lastSync = millis();
    if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
    bool ok = syncTime();
    if (ok && !timeReady) { tft.fillScreen(TFT_WHITE); drawHeader(); lastSlot = -1; }
    timeReady = ok;
    if (!timeReady) drawTimeError();
  }

  if (!timeReady) { delay(1000); return; }

  long slot = (long)(time(nullptr) / SLOT_SECONDS);
  if (slot != lastSlot) {
    lastSlot = slot;
    char code[CODE_LENGTH + 1];
    codeForSlot(slot, code);
    drawQr(code);
    drawFooter(code);

    if (millis() - lastHeartbeat > 300UL * 1000UL || lastHeartbeat == 0) {
      lastHeartbeat = millis();
      sendHeartbeat(code);
    }
  }
  delay(250);
}
```

- [ ] **Step 4: config.h 를 gitignore 에 추가**

`.gitignore` 끝에 추가한다:

```
firmware/study-qr/src/config.h
```

- [ ] **Step 5: README 작성**

`firmware/study-qr/README.md`:

```markdown
# 스터디 QR 표시 장비

LOLIN D32 + 2.4" ILI9341(240×320) SPI. 60초마다 서명된 6자리 코드를 QR로 표시한다.

## 배선

| ILI9341 | LOLIN D32 |
|---------|-----------|
| VCC | 3V3 |
| GND | GND |
| CS | GPIO5 |
| RST | GPIO4 |
| DC(RS) | GPIO2 |
| SDI(MOSI) | GPIO23 |
| CLK | GPIO18 |
| LED | GPIO15 |

둘 다 3.3V라 레벨시프터가 필요 없다. 모듈의 SD 슬롯은 쓰지 않는다.

## 빌드

```bash
cp src/config.h.example src/config.h   # 값을 채운다
pio run -t upload
pio device monitor
```

`DEVICE_SECRET` 은 서버 `.env` 의 `ATTENDANCE_DEVICE_SECRETS` 에 `방번호:시크릿` 형태로 등록한 값과 같아야 한다.

## 동작

- 부팅 시 Wi-Fi 접속 후 NTP 동기화. 실패하면 QR 대신 "시각 동기화 실패"를 띄운다.
  틀린 QR을 띄우면 반복 실패로 신뢰를 잃기 때문에 아무것도 띄우지 않는 쪽을 택했다.
- 1시간마다 NTP 재동기화(RTC 없음).
- 5분마다 하트비트를 보내고 응답의 재실 인원을 하단에 표시한다.
```

- [ ] **Step 6: 컴파일 확인**

```bash
cd firmware/study-qr && cp src/config.h.example src/config.h && pio run
```

Expected: 컴파일 성공. 업로드는 실제 장비가 연결된 상태에서만 수행한다.

- [ ] **Step 7: 커밋**

```bash
git add firmware/ .gitignore
git commit -m "feat: ESP32 QR 표시 펌웨어"
```

---

### Task 14: 배포 설정과 문서

**Files:**
- Modify: `README.md`
- Create: `.env.example` (없으면 생성, 있으면 항목 추가)
- Modify: `src/app/page.tsx` (스터디 화면으로 가는 링크 추가)

**Interfaces:**
- Consumes: 전 태스크
- Produces: 배포 가능한 상태

- [ ] **Step 1: 환경변수 예시에 항목 추가**

`.env.example` 에 다음을 추가한다(파일이 없으면 새로 만든다):

```
# 스터디 시간 기록 — 장비별 시크릿. 형식: 방번호:시크릿,방번호:시크릿
# 방번호는 rooms 테이블의 id (1=공학실습동 24214, 2=학생회관 03324)
ATTENDANCE_DEVICE_SECRETS=1:change-me-room1,2:change-me-room2

# 학번 원장 CSV 경로 (기본 ./data/roster.csv). repo 에 커밋하지 않는다.
ROSTER_CSV=./data/roster.csv
```

- [ ] **Step 2: 홈에서 스터디 화면으로 가는 링크 추가**

`src/app/page.tsx` 의 최상위 반환 JSX 안, 기존 헤더 영역 바로 아래에 추가한다:

```tsx
      <nav className="flex gap-4 px-4 py-2 text-sm">
        <a className="underline" href="/study">내 스터디</a>
        <a className="underline" href="/study/ranking">순위</a>
        <a className="underline" href="/study/teams">팀 현황</a>
      </nav>
```

- [ ] **Step 3: README 에 운영 절차 추가**

`README.md` 끝에 추가한다:

```markdown
## 스터디 시간 기록

설계: `docs/superpowers/specs/2026-08-21-study-time-tracking-design.md`

### 최초 설정

```bash
# 1. 학번 원장 CSV 생성 (개인정보 — repo 에 커밋 금지)
uvx --from openpyxl python scripts/roster-to-csv.py <명부.xlsx> <스터디시트.xlsx>

# 2. 마이그레이션 + 시드
npm run migrate && npm run seed:members

# 3. .env 에 ATTENDANCE_DEVICE_SECRETS 설정 후 재시작
```

장비 펌웨어는 `firmware/study-qr/` 참조. 장비의 `DEVICE_SECRET` 은
`ATTENDANCE_DEVICE_SECRETS` 의 해당 방 시크릿과 같아야 한다.

### 화면

| 경로 | 내용 |
|------|------|
| `/c/<코드>` | QR 스캔 진입점. 체크인/체크아웃 자동 판정 |
| `/onboarding` | 학번 등록 (최초 1회) |
| `/study` | 내 현황 — 잔디, 기록, 수정 이력, 미확정 신고 |
| `/study/ranking` | 전체 순위 (엔트리 컷 라인) |
| `/study/teams` | 세부팀별 히트맵 |
| `/admin/study` | 승인 큐, 장비 상태, 설정, CSV 내보내기 |
```

- [ ] **Step 4: 전체 검증**

```bash
npm run lint && npm test && npm run build
```

Expected: 셋 다 성공.

- [ ] **Step 5: 커밋**

```bash
git add README.md .env.example src/app/page.tsx
git commit -m "docs: 스터디 시간 기록 운영 절차 + 홈 링크"
```
