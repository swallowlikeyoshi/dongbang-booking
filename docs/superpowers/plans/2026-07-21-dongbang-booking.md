# 동방 예약 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HEVEN 동아리방 2개를 구글 로그인 사용자가 30분 슬롯 단위로 예약하고, 관리자가 운영하는 셀프호스팅 웹앱을 만든다.

**Architecture:** Next.js(App Router) 풀스택 단일 서버. API 라우트가 SQLite(Drizzle) DB를 다루고, Auth.js(Google)로 신원을 확인한다. 예약 겹침 검사·30분 스냅 같은 핵심 규칙은 순수 함수로 분리해 단위 테스트한다. 젯슨에서 도커(standalone)로 구동하고 GitHub Actions가 GHCR로 멀티아치 이미지를 푸시한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, better-sqlite3 + drizzle-orm, next-auth v5(beta), vitest, Docker(Containerfile), GitHub Actions → GHCR. (모두 `luftaquila/ksae-notice`와 동일 버전대.)

## Global Constraints

- Node.js 20+ (컨테이너는 `node:24-alpine`).
- Next.js `output: "standalone"`, `serverExternalPackages: ["better-sqlite3"]`.
- SQLite 경로는 `DATABASE_PATH` 환경변수(기본 `./data/dongbang.db`), 컨테이너에서 `/app/data/dongbang.db` 볼륨.
- 시간은 모두 unix timestamp(초 단위 정수)로 저장. 슬롯 격자 = **1800초(30분)**.
- 팀 값은 정확히 `전기팀` / `기계팀` / `자율차팀` / `기타` 네 가지만 허용.
- 관리자 판정: 세션 `email`이 `ADMIN_EMAIL`(쉼표 구분) 목록에 포함될 때. 모든 쓰기/관리 API는 **서버측에서** 권한 재검증.
- 읽기(캘린더 조회) API는 비인증 허용. 생성/취소는 인증 필요.
- 패키지 매니저는 `npm`(ksae-notice와 동일, `package-lock.json` 사용).

---

## File Structure

```
dongbang-booking/
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── vitest.config.ts
├── Containerfile
├── .dockerignore
├── .gitignore
├── .env.example
├── .github/workflows/build.yml
├── src/
│   ├── lib/
│   │   ├── constants.ts          # TEAMS, TEAM_COLORS, SLOT_SECONDS
│   │   ├── reservations.ts       # 순수 로직: snapToSlot, overlaps, validateReservation
│   │   ├── admin.ts              # isAdmin(email)
│   │   └── db/
│   │       ├── schema.ts         # rooms, reservations 테이블
│   │       ├── index.ts          # drizzle 클라이언트 (better-sqlite3)
│   │       ├── migrate.ts        # 마이그레이션 실행 + 방 2개 seed
│   │       └── queries.ts        # listReservations, createReservation, deleteReservation, listRooms, renameRoom
│   ├── auth.ts                   # next-auth 설정 (Google provider)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 메인 주간 캘린더 (public)
│   │   ├── globals.css
│   │   ├── my/page.tsx           # 내 예약
│   │   ├── admin/page.tsx        # 관리자
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── reservations/route.ts        # GET(public), POST(auth)
│   │       ├── reservations/[id]/route.ts   # DELETE(owner/admin)
│   │       └── rooms/route.ts               # GET(public), PATCH(admin rename)
│   └── components/
│       ├── WeekCalendar.tsx      # 주간 그리드 렌더 + 슬롯 선택
│       ├── ReservationModal.tsx  # 팀/설명/시간 입력
│       └── SessionButtons.tsx    # 로그인/로그아웃 버튼
├── drizzle/                      # drizzle-kit 생성 마이그레이션 SQL
└── docs/superpowers/{specs,plans}/
```

**단위 경계 원칙:** 순수 로직(`reservations.ts`, `admin.ts`)은 DB·React와 무관하게 테스트한다. DB 쿼리(`queries.ts`)는 얇게. API 라우트는 인증·검증 후 쿼리 호출만. UI 컴포넌트는 데이터를 props로 받는다.

---

## Task 1: 프로젝트 스캐폴드 + 설정 파일

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.dockerignore`, `.env.example`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces: 실행 가능한 빈 Next.js 앱, `npm test`(vitest) 동작.

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "dongbang-booking",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "migrate": "tsx src/lib/db/migrate.ts",
    "db:generate": "drizzle-kit generate",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "drizzle-orm": "^0.45.2",
    "next": "16.2.3",
    "next-auth": "^5.0.0-beta.30",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: 설정 파일들 작성**

`next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`postcss.config.mjs`:
```javascript
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`.gitignore`:
```
node_modules
.next
data
*.db
.env
.env.local
next-env.d.ts
```

`.dockerignore`:
```
node_modules
.next
data
.git
docs
```

`.env.example`:
```
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_SECRET=
ADMIN_EMAIL=you@example.com,other@example.com
NEXTAUTH_URL=http://localhost:3000
DATABASE_PATH=./data/dongbang.db
```

- [ ] **Step 3: 최소 앱 파일 작성**

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import "./globals.css";

export const metadata = { title: "동방 예약", description: "HEVEN 동아리방 예약" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (임시 — Task 6에서 교체):
```tsx
export default function Home() {
  return <main className="p-8">동방 예약 (준비 중)</main>;
}
```

- [ ] **Step 4: 의존성 설치 + 빌드 확인**

Run: `npm install && npm run build`
Expected: 빌드 성공, `.next/standalone` 생성.

- [ ] **Step 5: vitest 동작 확인용 스모크 테스트**

Create `src/lib/smoke.test.ts`:
```typescript
import { expect, test } from "vitest";
test("vitest runs", () => { expect(1 + 1).toBe(2); });
```
Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Next.js 스캐폴드 + 설정"
```

---

## Task 2: 상수 + 예약 순수 로직 (TDD)

**Files:**
- Create: `src/lib/constants.ts`, `src/lib/reservations.ts`, `src/lib/reservations.test.ts`
- Delete: `src/lib/smoke.test.ts`

**Interfaces:**
- Produces:
  - `SLOT_SECONDS = 1800`
  - `TEAMS = ["전기팀","기계팀","자율차팀","기타"] as const`; `Team` 타입
  - `TEAM_COLORS: Record<Team, string>` (Tailwind 클래스 문자열)
  - `snapToSlot(ts: number): number` — 1800초 격자 내림
  - `overlaps(a: {start_at:number,end_at:number}, b: {start_at:number,end_at:number}): boolean`
  - `validateReservation(input: NewReservationInput, existing: ExistingReservation[]): { ok: true } | { ok: false; error: string }`
  - 타입 `NewReservationInput = { room_id:number; team:string; title:string|null; start_at:number; end_at:number }`
  - 타입 `ExistingReservation = { room_id:number; start_at:number; end_at:number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/reservations.test.ts`:
```typescript
import { expect, test, describe } from "vitest";
import { snapToSlot, overlaps, validateReservation } from "./reservations";
import { SLOT_SECONDS } from "./constants";

describe("snapToSlot", () => {
  test("정각은 그대로", () => {
    const t = 1800 * 100;
    expect(snapToSlot(t)).toBe(t);
  });
  test("30분 격자 아래로 내림", () => {
    expect(snapToSlot(1800 * 100 + 600)).toBe(1800 * 100);
  });
  test("SLOT_SECONDS는 1800", () => {
    expect(SLOT_SECONDS).toBe(1800);
  });
});

describe("overlaps", () => {
  const base = { start_at: 1000, end_at: 2000 };
  test("겹치면 true", () => {
    expect(overlaps(base, { start_at: 1500, end_at: 2500 })).toBe(true);
  });
  test("맞닿기만 하면 false (end==start 허용)", () => {
    expect(overlaps(base, { start_at: 2000, end_at: 3000 })).toBe(false);
  });
  test("완전히 떨어지면 false", () => {
    expect(overlaps(base, { start_at: 3000, end_at: 4000 })).toBe(false);
  });
});

describe("validateReservation", () => {
  const valid = { room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600 };
  test("정상 입력은 ok", () => {
    expect(validateReservation(valid, [])).toEqual({ ok: true });
  });
  test("잘못된 팀은 거절", () => {
    const r = validateReservation({ ...valid, team: "축구팀" }, []);
    expect(r.ok).toBe(false);
  });
  test("start >= end 거절", () => {
    const r = validateReservation({ ...valid, start_at: 3600, end_at: 3600 }, []);
    expect(r.ok).toBe(false);
  });
  test("격자에 안 맞으면 거절", () => {
    const r = validateReservation({ ...valid, start_at: 1900 }, []);
    expect(r.ok).toBe(false);
  });
  test("같은 방 시간 겹치면 거절", () => {
    const existing = [{ room_id: 1, start_at: 1800, end_at: 5400 }];
    const r = validateReservation(valid, existing);
    expect(r.ok).toBe(false);
  });
  test("다른 방이면 겹쳐도 ok", () => {
    const existing = [{ room_id: 2, start_at: 1800, end_at: 5400 }];
    expect(validateReservation(valid, existing)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `reservations.ts`, `constants.ts` 없음.

- [ ] **Step 3: 상수 구현**

`src/lib/constants.ts`:
```typescript
export const SLOT_SECONDS = 1800;

export const TEAMS = ["전기팀", "기계팀", "자율차팀", "기타"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_COLORS: Record<Team, string> = {
  전기팀: "bg-blue-500",
  기계팀: "bg-orange-500",
  자율차팀: "bg-green-500",
  기타: "bg-gray-500",
};
```

- [ ] **Step 4: 순수 로직 구현**

`src/lib/reservations.ts`:
```typescript
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS.

- [ ] **Step 6: Commit**

```bash
git rm src/lib/smoke.test.ts
git add -A
git commit -m "feat: 예약 순수 로직(스냅/겹침/검증) + 상수"
```

---

## Task 3: 관리자 판정 로직 (TDD)

**Files:**
- Create: `src/lib/admin.ts`, `src/lib/admin.test.ts`

**Interfaces:**
- Produces: `isAdmin(email: string | null | undefined): boolean` — `process.env.ADMIN_EMAIL`(쉼표 구분, 공백 무시, 대소문자 무시)에 포함되면 true.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin.test.ts`:
```typescript
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { isAdmin } from "./admin";

describe("isAdmin", () => {
  const original = process.env.ADMIN_EMAIL;
  beforeEach(() => { process.env.ADMIN_EMAIL = " Boss@Example.com , dev@heven.io "; });
  afterEach(() => { process.env.ADMIN_EMAIL = original; });

  test("목록에 있으면 true (공백/대소문자 무시)", () => {
    expect(isAdmin("boss@example.com")).toBe(true);
    expect(isAdmin("dev@heven.io")).toBe(true);
  });
  test("목록에 없으면 false", () => {
    expect(isAdmin("random@gmail.com")).toBe(false);
  });
  test("null/undefined는 false", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
  test("ADMIN_EMAIL 미설정 시 항상 false", () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdmin("boss@example.com")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/admin.test.ts`
Expected: FAIL — `admin.ts` 없음.

- [ ] **Step 3: 구현**

`src/lib/admin.ts`:
```typescript
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAIL;
  if (!raw) return false;
  const list = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test src/lib/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 관리자 이메일 판정 로직"
```

---

## Task 4: DB 스키마 + 클라이언트 + 마이그레이션/시드

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/migrate.ts`, `drizzle.config.ts`
- Generate: `drizzle/*.sql` (drizzle-kit)

**Interfaces:**
- Produces:
  - `rooms` 테이블: `id`(pk), `name`(text)
  - `reservations` 테이블: `id`(pk auto), `room_id`(int), `team`(text), `title`(text nullable), `user_email`(text), `user_name`(text), `start_at`(int), `end_at`(int), `created_at`(int)
  - `db` — drizzle 인스턴스 (`src/lib/db/index.ts` default 아님, named export `db`)
  - `migrate.ts` 실행 시 마이그레이션 적용 + 방 2개(`동방 A`, `동방 B`)가 없으면 삽입.

- [ ] **Step 1: 스키마 작성**

`src/lib/db/schema.ts`:
```typescript
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const reservations = sqliteTable("reservations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  room_id: integer("room_id").notNull(),
  team: text("team").notNull(),
  title: text("title"),
  user_email: text("user_email").notNull(),
  user_name: text("user_name").notNull(),
  start_at: integer("start_at").notNull(),
  end_at: integer("end_at").notNull(),
  created_at: integer("created_at").notNull(),
});
```

- [ ] **Step 2: drizzle 설정 + 클라이언트**

`drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
```

`src/lib/db/index.ts`:
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? "./data/dongbang.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { schema };
```

- [ ] **Step 3: 마이그레이션 SQL 생성**

Run: `npm run db:generate`
Expected: `drizzle/0000_*.sql` 생성됨(두 테이블 CREATE).

- [ ] **Step 4: 마이그레이션 + 시드 스크립트**

`src/lib/db/migrate.ts`:
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { rooms } from "./schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? "./data/dongbang.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });

const defaults = [
  { id: 1, name: "동방 A" },
  { id: 2, name: "동방 B" },
];
for (const r of defaults) {
  const existing = db.select().from(rooms).where(eq(rooms.id, r.id)).all();
  if (existing.length === 0) db.insert(rooms).values(r).run();
}

console.log("migrate + seed done:", dbPath);
sqlite.close();
```

- [ ] **Step 5: 실행 확인**

Run: `npm run migrate`
Expected: `migrate + seed done` 출력, `data/dongbang.db` 생성.

Run: `npx tsx -e "import('better-sqlite3').then(({default:D})=>{const d=new D(process.env.DATABASE_PATH??'./data/dongbang.db');console.log(d.prepare('select * from rooms').all())})"`
Expected: `[ { id: 1, name: '동방 A' }, { id: 2, name: '동방 B' } ]`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: DB 스키마 + 마이그레이션 + 방 2개 시드"
```

---

## Task 5: DB 쿼리 계층

**Files:**
- Create: `src/lib/db/queries.ts`, `src/lib/db/queries.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` (Task 4); `NewReservationInput`, `validateReservation` (Task 2).
- Produces:
  - `listRooms(): Room[]`
  - `renameRoom(id: number, name: string): void`
  - `listReservations(rangeStart: number, rangeEnd: number): Reservation[]` — `start_at < rangeEnd && end_at > rangeStart` 인 예약, 방 무관 전체.
  - `createReservation(input: NewReservationInput & { user_email: string; user_name: string }): { ok: true; id: number } | { ok: false; error: string }` — 내부에서 겹침 검사(현재 DB의 겹칠 수 있는 예약을 읽어 `validateReservation` 호출) 후 삽입.
  - `getReservation(id: number): Reservation | null`
  - `deleteReservation(id: number): void`
  - 타입 `Room`, `Reservation` (drizzle inferSelect).

- [ ] **Step 1: 실패하는 테스트 작성 (인메모리 DB)**

`src/lib/db/queries.test.ts`:
```typescript
import { expect, test, describe, beforeEach } from "vitest";

// 인메모리 DB로 격리 테스트. DATABASE_PATH를 :memory: 로 두고 모듈 로드.
process.env.DATABASE_PATH = ":memory:";

const q = await import("./queries");
const { db, schema } = await import("./index");
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("queries", () => {
  beforeEach(() => {
    migrate(db as never, { migrationsFolder: "./drizzle" });
    db.delete(schema.reservations).run();
    db.delete(schema.rooms).run();
    db.insert(schema.rooms).values([{ id: 1, name: "동방 A" }, { id: 2, name: "동방 B" }]).run();
  });

  test("listRooms 는 2개", () => {
    expect(q.listRooms()).toHaveLength(2);
  });

  test("createReservation 성공 후 listReservations 로 조회", () => {
    const r = q.createReservation({
      room_id: 1, team: "전기팀", title: "회의",
      start_at: 1800, end_at: 3600,
      user_email: "a@b.com", user_name: "A",
    });
    expect(r.ok).toBe(true);
    const list = q.listReservations(0, 10000);
    expect(list).toHaveLength(1);
    expect(list[0].team).toBe("전기팀");
  });

  test("겹치는 예약은 거절", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 5400, user_email: "a@b.com", user_name: "A" });
    const r = q.createReservation({ room_id: 1, team: "기계팀", title: null, start_at: 3600, end_at: 7200, user_email: "c@d.com", user_name: "C" });
    expect(r.ok).toBe(false);
  });

  test("deleteReservation 후 사라짐", () => {
    const r = q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    if (!r.ok) throw new Error("setup failed");
    q.deleteReservation(r.id);
    expect(q.listReservations(0, 10000)).toHaveLength(0);
  });

  test("renameRoom", () => {
    q.renameRoom(1, "새 이름");
    expect(q.listRooms().find((x) => x.id === 1)!.name).toBe("새 이름");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/db/queries.test.ts`
Expected: FAIL — `queries.ts` 없음.

- [ ] **Step 3: 쿼리 구현**

`src/lib/db/queries.ts`:
```typescript
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "./index";
import { validateReservation, type NewReservationInput } from "@/lib/reservations";

export type Room = typeof schema.rooms.$inferSelect;
export type Reservation = typeof schema.reservations.$inferSelect;

export function listRooms(): Room[] {
  return db.select().from(schema.rooms).all();
}

export function renameRoom(id: number, name: string): void {
  db.update(schema.rooms).set({ name }).where(eq(schema.rooms.id, id)).run();
}

export function listReservations(rangeStart: number, rangeEnd: number): Reservation[] {
  return db
    .select()
    .from(schema.reservations)
    .where(and(lt(schema.reservations.start_at, rangeEnd), gt(schema.reservations.end_at, rangeStart)))
    .all();
}

export function getReservation(id: number): Reservation | null {
  const rows = db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).all();
  return rows[0] ?? null;
}

export function deleteReservation(id: number): void {
  db.delete(schema.reservations).where(eq(schema.reservations.id, id)).run();
}

export function createReservation(
  input: NewReservationInput & { user_email: string; user_name: string },
): { ok: true; id: number } | { ok: false; error: string } {
  // 같은 방의 겹칠 수 있는 예약만 읽어 검증
  const candidates = db
    .select({ room_id: schema.reservations.room_id, start_at: schema.reservations.start_at, end_at: schema.reservations.end_at })
    .from(schema.reservations)
    .where(eq(schema.reservations.room_id, input.room_id))
    .all();

  const check = validateReservation(input, candidates);
  if (!check.ok) return check;

  const res = db
    .insert(schema.reservations)
    .values({
      room_id: input.room_id,
      team: input.team,
      title: input.title,
      user_email: input.user_email,
      user_name: input.user_name,
      start_at: input.start_at,
      end_at: input.end_at,
      created_at: Math.floor(Date.now() / 1000),
    })
    .run();
  return { ok: true, id: Number(res.lastInsertRowid) };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test src/lib/db/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: DB 쿼리 계층 + 인메모리 테스트"
```

---

## Task 6: Auth.js Google 설정 + 세션 헬퍼

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/components/SessionButtons.tsx`
- Modify: `src/app/layout.tsx` (SessionProvider 불필요 — 서버 컴포넌트에서 `auth()` 사용)

**Interfaces:**
- Consumes: `isAdmin` (Task 3).
- Produces:
  - `auth`, `handlers`, `signIn`, `signOut` (next-auth v5 export)
  - `getSessionUser(): Promise<{ email: string; name: string; isAdmin: boolean } | null>` — 서버에서 세션 조회 + 관리자 판정.

- [ ] **Step 1: auth 설정**

`src/auth.ts`:
```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdmin } from "@/lib/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
});

export async function getSessionUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return {
    email,
    name: session.user?.name ?? email,
    isAdmin: isAdmin(email),
  };
}
```

- [ ] **Step 2: auth 라우트**

`src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: 로그인/로그아웃 버튼 (서버 액션)**

`src/components/SessionButtons.tsx`:
```tsx
import { auth, signIn, signOut } from "@/auth";

export default async function SessionButtons() {
  const session = await auth();
  if (session?.user) {
    return (
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
        <span className="mr-2 text-sm">{session.user.name}</span>
        <button className="rounded bg-gray-200 px-3 py-1 text-sm">로그아웃</button>
      </form>
    );
  }
  return (
    <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
      <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">구글 로그인</button>
    </form>
  );
}
```

- [ ] **Step 4: 빌드로 타입 확인 (OAuth 실제 로그인은 Task 10 배포 후 수동 검증)**

Run: `npm run build`
Expected: 빌드 성공. (실 로그인은 구글 콘솔 자격증명 필요 → 배포 검증에서 확인.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Auth.js Google 로그인 + 세션 헬퍼"
```

---

## Task 7: 예약 API 라우트

**Files:**
- Create: `src/app/api/reservations/route.ts`, `src/app/api/reservations/[id]/route.ts`, `src/app/api/rooms/route.ts`

**Interfaces:**
- Consumes: `getSessionUser` (Task 6); `listReservations`, `createReservation`, `getReservation`, `deleteReservation`, `listRooms`, `renameRoom` (Task 5); `snapToSlot` (Task 2).
- Produces (HTTP 계약):
  - `GET /api/reservations?start=<ts>&end=<ts>` → `200 { reservations: Reservation[] }` (public)
  - `POST /api/reservations` body `{ room_id, team, title, start_at, end_at }` → `201 { id }` | `400 { error }` | `401`
  - `DELETE /api/reservations/:id` → `204` | `401` | `403` | `404`
  - `GET /api/rooms` → `200 { rooms: Room[] }` (public)
  - `PATCH /api/rooms` body `{ id, name }` → `200 { ok:true }` | `401` | `403` (admin only)

- [ ] **Step 1: reservations 컬렉션 라우트**

`src/app/api/reservations/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { listReservations, createReservation } from "@/lib/db/queries";
import { snapToSlot } from "@/lib/reservations";

export async function GET(req: NextRequest) {
  const start = Number(req.nextUrl.searchParams.get("start"));
  const end = Number(req.nextUrl.searchParams.get("end"));
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json({ error: "start/end 필요" }, { status: 400 });
  }
  return NextResponse.json({ reservations: listReservations(start, end) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const input = {
    room_id: Number(body.room_id),
    team: String(body.team),
    title: body.title ? String(body.title) : null,
    start_at: snapToSlot(Number(body.start_at)),
    end_at: snapToSlot(Number(body.end_at)),
    user_email: user.email,
    user_name: user.name,
  };

  const result = createReservation(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
```

- [ ] **Step 2: 개별 예약 삭제 라우트**

`src/app/api/reservations/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { getReservation, deleteReservation } from "@/lib/db/queries";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { id } = await params;
  const reservation = getReservation(Number(id));
  if (!reservation) return NextResponse.json({ error: "없음" }, { status: 404 });

  const isOwner = reservation.user_email === user.email;
  if (!isOwner && !user.isAdmin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  deleteReservation(reservation.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: rooms 라우트 (조회 + 관리자 이름변경)**

`src/app/api/rooms/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/auth";
import { listRooms, renameRoom } from "@/lib/db/queries";

export async function GET() {
  return NextResponse.json({ rooms: listRooms() });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.name) return NextResponse.json({ error: "id/name 필요" }, { status: 400 });

  renameRoom(Number(body.id), String(body.name));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 빌드 + 라우트 스모크 검증**

Run: `npm run build && npm run migrate`
그다음 개발 서버로 GET 검증:
Run: `npm run dev &` 후 `sleep 4 && curl -s "http://localhost:3000/api/rooms"`
Expected: `{"rooms":[{"id":1,"name":"동방 A"},{"id":2,"name":"동방 B"}]}`
정리: `curl -s "http://localhost:3000/api/reservations?start=0&end=9999999999"` → `{"reservations":[]}`; 이후 `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 예약/방 API 라우트 (인증·권한 서버 검증)"
```

---

## Task 8: 주간 캘린더 컴포넌트 (읽기 전용 표시)

**Files:**
- Create: `src/components/WeekCalendar.tsx`, `src/lib/week.ts`, `src/lib/week.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `TEAM_COLORS` (Task 2), `Reservation`/`Room` (Task 5), `SessionButtons` (Task 6).
- Produces:
  - `src/lib/week.ts`: `weekStart(now: number): number` (해당 주 월요일 00:00 로컬, unix ts), `slotRows(): {hour:number;min:number}[]` (하루 30분 슬롯 라벨 배열, 08:00~24:00), `dayColumns(weekStartTs: number): number[]` (월~일 7일 각 00:00 ts).
  - `WeekCalendar` 컴포넌트: props `{ rooms: Room[]; reservations: Reservation[]; weekStartTs: number; onSlotClick?: (roomId:number, startTs:number)=>void }` — 방별 주간 그리드 렌더, 예약을 팀 색으로 표시.

- [ ] **Step 1: week.ts 실패 테스트**

`src/lib/week.test.ts`:
```typescript
import { expect, test, describe } from "vitest";
import { weekStart, dayColumns, slotRows } from "./week";

describe("week helpers", () => {
  test("weekStart 는 월요일 00:00", () => {
    // 2026-07-21 화요일 12:00 KST 근처 임의 ts
    const tue = Math.floor(new Date("2026-07-21T12:00:00").getTime() / 1000);
    const ws = weekStart(tue);
    const d = new Date(ws * 1000);
    expect(d.getDay()).toBe(1); // 월요일
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
  test("dayColumns 는 7일", () => {
    const tue = Math.floor(new Date("2026-07-21T12:00:00").getTime() / 1000);
    expect(dayColumns(weekStart(tue))).toHaveLength(7);
  });
  test("slotRows 는 08:00~23:30 = 32슬롯", () => {
    const rows = slotRows();
    expect(rows[0]).toEqual({ hour: 8, min: 0 });
    expect(rows).toHaveLength(32);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test src/lib/week.test.ts`
Expected: FAIL.

- [ ] **Step 3: week.ts 구현**

`src/lib/week.ts`:
```typescript
export function weekStart(now: number): number {
  const d = new Date(now * 1000);
  const day = d.getDay(); // 0=일
  const diff = (day === 0 ? -6 : 1 - day); // 월요일까지 이동
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function dayColumns(weekStartTs: number): number[] {
  const cols: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartTs * 1000);
    d.setDate(d.getDate() + i);
    cols.push(Math.floor(d.getTime() / 1000));
  }
  return cols;
}

export function slotRows(): { hour: number; min: number }[] {
  const rows: { hour: number; min: number }[] = [];
  for (let h = 8; h < 24; h++) {
    rows.push({ hour: h, min: 0 });
    rows.push({ hour: h, min: 30 });
  }
  return rows;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test src/lib/week.test.ts`
Expected: PASS.

- [ ] **Step 5: WeekCalendar 컴포넌트 (client)**

`src/components/WeekCalendar.tsx`:
```tsx
"use client";

import { TEAM_COLORS, type Team } from "@/lib/constants";
import { dayColumns, slotRows } from "@/lib/week";
import type { Reservation, Room } from "@/lib/db/queries";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function WeekCalendar({
  rooms, reservations, weekStartTs, onSlotClick,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
  onSlotClick?: (roomId: number, startTs: number) => void;
}) {
  const days = dayColumns(weekStartTs);
  const rows = slotRows();

  function resAt(roomId: number, dayTs: number, hour: number, min: number): Reservation | undefined {
    const slot = dayTs + hour * 3600 + min * 60;
    return reservations.find(
      (r) => r.room_id === roomId && r.start_at <= slot && slot < r.end_at,
    );
  }

  return (
    <div className="space-y-8">
      {rooms.map((room) => (
        <section key={room.id}>
          <h2 className="mb-2 text-lg font-semibold">{room.name}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-14 border p-1"></th>
                  {days.map((dTs, i) => (
                    <th key={dTs} className="border p-1">
                      {DAYS[i]} {new Date(dTs * 1000).getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ hour, min }) => (
                  <tr key={`${hour}:${min}`}>
                    <td className="border p-1 text-right text-gray-500">
                      {min === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </td>
                    {days.map((dTs) => {
                      const r = resAt(room.id, dTs, hour, min);
                      const slotTs = dTs + hour * 3600 + min * 60;
                      const isStart = r && r.start_at === slotTs;
                      return (
                        <td
                          key={dTs}
                          onClick={() => !r && onSlotClick?.(room.id, slotTs)}
                          className={`h-6 border ${r ? `${TEAM_COLORS[r.team as Team]} text-white` : "cursor-pointer hover:bg-gray-100"}`}
                        >
                          {isStart ? <span className="px-1">{r!.team}{r!.title ? ` · ${r!.title}` : ""}</span> : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: 메인 페이지에서 서버 데이터 로드 + 렌더**

`src/app/page.tsx`:
```tsx
import SessionButtons from "@/components/SessionButtons";
import HomeClient from "@/components/HomeClient";
import { listRooms, listReservations } from "@/lib/db/queries";
import { weekStart, dayColumns } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = Math.floor(Date.now() / 1000);
  const ws = weekStart(now);
  const weekEnd = dayColumns(ws)[6] + 24 * 3600;
  const rooms = listRooms();
  const reservations = listReservations(ws, weekEnd);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">동방 예약</h1>
        <div className="flex items-center gap-3">
          <a href="/my" className="text-sm text-blue-600">내 예약</a>
          <SessionButtons />
        </div>
      </header>
      <HomeClient rooms={rooms} reservations={reservations} weekStartTs={ws} />
    </main>
  );
}
```

> `HomeClient`(예약 생성 모달 연결)는 Task 9에서 만든다. 이 Task에서는 임시로 `WeekCalendar`만 직접 렌더해 표시를 검증한다: `page.tsx`의 `<HomeClient .../>`를 `<WeekCalendar rooms={rooms} reservations={reservations} weekStartTs={ws} />`로 두고 빌드 → Task 9에서 교체.

- [ ] **Step 7: 표시 검증 (수동)**

Run: `npm run migrate && npm run build && npm run start &` 후 `sleep 4`, 브라우저(또는 curl로 HTML) `http://localhost:3000` 확인 → 방 2개의 주간 표가 렌더되는지. 필요 시 DB에 더미 예약 삽입 후 색 블록 확인. 이후 `kill %1`.
Expected: 방 A/B 각각 월~일 × 08:00~23:30 격자 표시.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 주간 캘린더 컴포넌트 + 메인 표시"
```

---

## Task 9: 예약 생성 UI (모달 + 주 이동)

**Files:**
- Create: `src/components/HomeClient.tsx`, `src/components/ReservationModal.tsx`
- Modify: `src/app/page.tsx` (HomeClient 사용으로 교체)

**Interfaces:**
- Consumes: `WeekCalendar` (Task 8), `TEAMS` (Task 2), `Reservation`/`Room` (Task 5).
- Produces: 클라이언트 상호작용 — 슬롯 클릭 시 모달 오픈, 팀/설명/종료시간 입력 후 `POST /api/reservations`, 성공 시 `router.refresh()`. 이전/다음 주 이동은 쿼리스트링 `?w=<weekStartTs>`로 서버 재조회.

- [ ] **Step 1: 예약 모달**

`src/components/ReservationModal.tsx`:
```tsx
"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/constants";

export default function ReservationModal({
  roomId, roomName, startTs, onClose, onCreated,
}: {
  roomId: number;
  roomName: string;
  startTs: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [team, setTeam] = useState<string>(TEAMS[0]);
  const [title, setTitle] = useState("");
  const [durationSlots, setDurationSlots] = useState(1); // 30분 단위
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const endTs = startTs + durationSlots * 1800;
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_id: roomId, team, title, start_at: startTs, end_at: endTs }),
    });
    setBusy(false);
    if (res.status === 401) { setError("로그인이 필요합니다."); return; }
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "실패"); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-80 rounded bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">{roomName} 예약</h3>
        <p className="mb-2 text-sm text-gray-600">{fmt(startTs)} ~ {fmt(endTs)}</p>
        <label className="block text-sm">팀
          <select className="mt-1 w-full rounded border p-1" value={team} onChange={(e) => setTeam(e.target.value)}>
            {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="mt-2 block text-sm">설명(선택)
          <input className="mt-1 w-full rounded border p-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 배터리팩 조립" />
        </label>
        <label className="mt-2 block text-sm">길이(30분 단위)
          <input type="number" min={1} max={48} className="mt-1 w-full rounded border p-1" value={durationSlots} onChange={(e) => setDurationSlots(Math.max(1, Number(e.target.value)))} />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded px-3 py-1 text-sm" onClick={onClose}>취소</button>
          <button disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50" onClick={submit}>예약</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: HomeClient (캘린더 + 모달 + 주 이동)**

`src/components/HomeClient.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WeekCalendar from "./WeekCalendar";
import ReservationModal from "./ReservationModal";
import type { Reservation, Room } from "@/lib/db/queries";

export default function HomeClient({
  rooms, reservations, weekStartTs,
}: {
  rooms: Room[];
  reservations: Reservation[];
  weekStartTs: number;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<{ roomId: number; startTs: number } | null>(null);

  function go(deltaWeeks: number) {
    const w = weekStartTs + deltaWeeks * 7 * 24 * 3600;
    router.push(`/?w=${w}`);
  }

  const selRoom = sel ? rooms.find((r) => r.id === sel.roomId) : null;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button className="rounded border px-2 py-1 text-sm" onClick={() => go(-1)}>← 이전 주</button>
        <button className="rounded border px-2 py-1 text-sm" onClick={() => go(1)}>다음 주 →</button>
        <span className="text-sm text-gray-500">
          {new Date(weekStartTs * 1000).toLocaleDateString("ko-KR")} 주간
        </span>
      </div>

      <WeekCalendar
        rooms={rooms}
        reservations={reservations}
        weekStartTs={weekStartTs}
        onSlotClick={(roomId, startTs) => setSel({ roomId, startTs })}
      />

      {sel && selRoom && (
        <ReservationModal
          roomId={sel.roomId}
          roomName={selRoom.name}
          startTs={sel.startTs}
          onClose={() => setSel(null)}
          onCreated={() => { setSel(null); router.refresh(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: page.tsx에서 `?w=` 주 파라미터 반영 + HomeClient 사용**

`src/app/page.tsx` 수정 (searchParams 처리):
```tsx
import SessionButtons from "@/components/SessionButtons";
import HomeClient from "@/components/HomeClient";
import { listRooms, listReservations } from "@/lib/db/queries";
import { weekStart, dayColumns } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const now = Math.floor(Date.now() / 1000);
  const ws = w ? Number(w) : weekStart(now);
  const weekEnd = dayColumns(ws)[6] + 24 * 3600;
  const rooms = listRooms();
  const reservations = listReservations(ws, weekEnd);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">동방 예약</h1>
        <div className="flex items-center gap-3">
          <a href="/my" className="text-sm text-blue-600">내 예약</a>
          <SessionButtons />
        </div>
      </header>
      <HomeClient rooms={rooms} reservations={reservations} weekStartTs={ws} />
    </main>
  );
}
```

- [ ] **Step 4: 빌드 + 수동 흐름 검증**

Run: `npm run build`
Expected: 성공. (로그인 후 예약 생성 전체 흐름은 OAuth 자격증명이 있는 배포 환경에서 최종 검증 — Task 10.)
로컬 표시/모달 오픈은 `npm run start` 후 슬롯 클릭 시 모달이 뜨는지 확인. (미로그인 시 예약 버튼 → "로그인 필요" 표시.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 예약 생성 모달 + 주 이동"
```

---

## Task 10: 내 예약 페이지 + 취소

**Files:**
- Create: `src/app/my/page.tsx`, `src/components/CancelButton.tsx`
- Add query: `src/lib/db/queries.ts`에 `listReservationsByUser(email: string): Reservation[]` 추가 + 테스트 1건.

**Interfaces:**
- Consumes: `getSessionUser` (Task 6), 쿼리 계층 (Task 5).
- Produces: `listReservationsByUser(email)`; `/my` 페이지(로그인 필요) — 본인 예약 목록 + 취소 버튼(`DELETE /api/reservations/:id`).

- [ ] **Step 1: 쿼리 추가 테스트 (실패)**

`src/lib/db/queries.test.ts`에 추가:
```typescript
  test("listReservationsByUser 는 본인 것만", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 2, team: "기계팀", title: null, start_at: 1800, end_at: 3600, user_email: "z@z.com", user_name: "Z" });
    expect(q.listReservationsByUser("a@b.com")).toHaveLength(1);
  });
```
Run: `npm test src/lib/db/queries.test.ts` → FAIL.

- [ ] **Step 2: 쿼리 구현**

`src/lib/db/queries.ts`에 추가:
```typescript
export function listReservationsByUser(email: string): Reservation[] {
  return db.select().from(schema.reservations).where(eq(schema.reservations.user_email, email)).all();
}
```
Run: `npm test src/lib/db/queries.test.ts` → PASS.

- [ ] **Step 3: 취소 버튼 컴포넌트**

`src/components/CancelButton.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CancelButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="rounded bg-red-500 px-2 py-1 text-xs text-white disabled:opacity-50"
      onClick={async () => {
        if (!confirm("예약을 취소할까요?")) return;
        setBusy(true);
        await fetch(`/api/reservations/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      취소
    </button>
  );
}
```

- [ ] **Step 4: 내 예약 페이지**

`src/app/my/page.tsx`:
```tsx
import { getSessionUser } from "@/auth";
import { listReservationsByUser, listRooms } from "@/lib/db/queries";
import CancelButton from "@/components/CancelButton";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const user = await getSessionUser();
  if (!user) {
    return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">로그인이 필요합니다.</p></main>;
  }
  const rooms = listRooms();
  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? `방 ${id}`;
  const list = listReservationsByUser(user.email).sort((a, b) => a.start_at - b.start_at);
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <a href="/" className="text-sm text-blue-600">← 홈</a>
      <h1 className="my-4 text-xl font-bold">내 예약</h1>
      {list.length === 0 ? <p className="text-gray-500">예약이 없습니다.</p> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{roomName(r.room_id)} · {r.team}{r.title ? ` · ${r.title}` : ""}<br /><span className="text-gray-500">{fmt(r.start_at)} ~ {fmt(r.end_at)}</span></span>
              <CancelButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: 빌드 확인 + Commit**

Run: `npm run build`
Expected: 성공.
```bash
git add -A
git commit -m "feat: 내 예약 페이지 + 취소"
```

---

## Task 11: 관리자 페이지

**Files:**
- Create: `src/app/admin/page.tsx`, `src/components/RoomRename.tsx`
- Add query: `src/lib/db/queries.ts`에 `listAllReservations(): Reservation[]` 추가 + 테스트 1건.

**Interfaces:**
- Consumes: `getSessionUser` (Task 6), `CancelButton` (Task 10), 쿼리 계층.
- Produces: `listAllReservations()`; `/admin` (관리자만) — 전체 예약 목록 + 강제 취소(기존 CancelButton 재사용) + 방 이름 변경 폼(`PATCH /api/rooms`).

- [ ] **Step 1: 쿼리 추가 (테스트 → 구현)**

테스트 추가:
```typescript
  test("listAllReservations 는 전체", () => {
    q.createReservation({ room_id: 1, team: "전기팀", title: null, start_at: 1800, end_at: 3600, user_email: "a@b.com", user_name: "A" });
    q.createReservation({ room_id: 2, team: "기계팀", title: null, start_at: 1800, end_at: 3600, user_email: "z@z.com", user_name: "Z" });
    expect(q.listAllReservations()).toHaveLength(2);
  });
```
구현 (`queries.ts`):
```typescript
export function listAllReservations(): Reservation[] {
  return db.select().from(schema.reservations).orderBy(schema.reservations.start_at).all();
}
```
`orderBy` 사용 위해 파일 상단 import에 `asc`가 필요 없으면 `orderBy(schema.reservations.start_at)`로 충분(drizzle 기본 오름차순).
Run: `npm test src/lib/db/queries.test.ts` → PASS.

- [ ] **Step 2: 방 이름 변경 폼**

`src/components/RoomRename.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RoomRename({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input className="rounded border p-1 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        disabled={busy}
        className="rounded bg-gray-700 px-2 py-1 text-xs text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          await fetch("/api/rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name: value }) });
          setBusy(false);
          router.refresh();
        }}
      >
        이름 변경
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 관리자 페이지**

`src/app/admin/page.tsx`:
```tsx
import { getSessionUser } from "@/auth";
import { listAllReservations, listRooms } from "@/lib/db/queries";
import CancelButton from "@/components/CancelButton";
import RoomRename from "@/components/RoomRename";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">로그인이 필요합니다.</p></main>;
  if (!user.isAdmin) return <main className="p-8"><a href="/" className="text-blue-600">← 홈</a><p className="mt-4">관리자만 접근할 수 있습니다.</p></main>;

  const rooms = listRooms();
  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? `방 ${id}`;
  const list = listAllReservations();
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-3xl p-4">
      <a href="/" className="text-sm text-blue-600">← 홈</a>
      <h1 className="my-4 text-xl font-bold">관리자</h1>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">방 이름</h2>
        <div className="space-y-2">
          {rooms.map((r) => <RoomRename key={r.id} id={r.id} name={r.name} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">전체 예약 ({list.length})</h2>
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{roomName(r.room_id)} · {r.team}{r.title ? ` · ${r.title}` : ""} · {r.user_name}<br /><span className="text-gray-500">{fmt(r.start_at)} ~ {fmt(r.end_at)}</span></span>
              <CancelButton id={r.id} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 관리자 링크를 메인 헤더에 조건부 노출**

`src/app/page.tsx` 헤더의 링크 영역에 추가 (getSessionUser 사용):
```tsx
// page.tsx 상단 import 추가
import { getSessionUser } from "@/auth";
// Home() 내부 rooms 로드 부근에 추가
const sessionUser = await getSessionUser();
// 헤더 <div className="flex items-center gap-3"> 안, <a href="/my"> 다음에:
{sessionUser?.isAdmin && <a href="/admin" className="text-sm text-blue-600">관리자</a>}
```

- [ ] **Step 5: 빌드 확인 + Commit**

Run: `npm run build`
Expected: 성공.
```bash
git add -A
git commit -m "feat: 관리자 페이지 (전체 예약/강제취소/방이름)"
```

---

## Task 12: Docker + CI/CD + README

**Files:**
- Create: `Containerfile`, `.github/workflows/build.yml`, `README.md`

**Interfaces:**
- Consumes: 전체 앱.
- Produces: 젯슨에서 `docker run` 가능한 멀티아치 이미지 + main 푸시 시 GHCR 자동 배포 + 배포 문서.

- [ ] **Step 1: Containerfile (ksae-notice 패턴, DB 경로만 교체)**

`Containerfile`:
```dockerfile
FROM node:24-alpine AS base
RUN apk add --no-cache python3 make g++

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/dongbang.db

# 시작 시 마이그레이션 + 시드 후 서버 기동
CMD ["sh", "-c", "node --import tsx src/lib/db/migrate.ts && node server.js"]
```

> 주의: `output: standalone` 은 `.next/standalone/server.js` 를 생성한다(커스텀 `server.ts` 없음). 마이그레이션은 `tsx`로 실행하므로 `tsx`가 프로덕션 deps에 있어야 한다 — Task 1의 `package.json`에서 `tsx`를 `devDependencies`가 아니라 `dependencies`로 이동할 것. (수정 후 `npm i`.)

- [ ] **Step 2: tsx를 dependencies로 이동**

`package.json`에서 `tsx`를 `devDependencies` → `dependencies`로 옮기고:
Run: `npm install`
Expected: lock 갱신.

- [ ] **Step 3: `.dockerignore` 에 data 포함 확인** (Task 1에서 이미 추가됨 — 확인만)

- [ ] **Step 4: 로컬 도커 빌드/구동 검증**

Run: `docker build -f Containerfile -t dongbang-booking:local .`
Run: `docker run --rm -p 3000:3000 -e ADMIN_EMAIL=test@test.com -e AUTH_SECRET=devsecret -e NEXTAUTH_URL=http://localhost:3000 -e AUTH_GOOGLE_ID=x -e AUTH_GOOGLE_SECRET=y -v dongbang-data:/app/data dongbang-booking:local`
그다음 `curl -s http://localhost:3000/api/rooms`
Expected: `{"rooms":[{"id":1,"name":"동방 A"},{"id":2,"name":"동방 B"}]}` (마이그레이션+시드가 컨테이너 시작 시 실행됨).

- [ ] **Step 5: GitHub Actions 워크플로 (멀티아치 → GHCR)**

`.github/workflows/build.yml`:
```yaml
name: build

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Containerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 6: README (배포 절차)**

`README.md`:
```markdown
# 동방 예약

HEVEN 동아리방 2개를 30분 슬롯 단위로 예약하는 셀프호스팅 웹앱. Next.js + SQLite + Auth.js(Google).

## 로컬 개발
```bash
npm install
cp .env.example .env   # 값 채우기
npm run migrate        # DB 생성 + 방 2개 시드
npm run dev
```

## 환경변수
| 변수 | 설명 |
|------|------|
| AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET | 구글 OAuth 클라이언트 |
| AUTH_SECRET | `npx auth secret` 로 생성 |
| ADMIN_EMAIL | 관리자 이메일(쉼표로 다중) |
| NEXTAUTH_URL | 배포 도메인 (예: https://dongbang.tailXXXX.ts.net) |
| DATABASE_PATH | SQLite 경로 (컨테이너 기본 /app/data/dongbang.db) |

## 구글 OAuth 설정
Google Cloud Console → OAuth 클라이언트(웹) →
승인된 리디렉션 URI: `{NEXTAUTH_URL}/api/auth/callback/google`

## 젯슨 배포 (GHCR 이미지)
```bash
docker run -d --restart unless-stopped -p 3000:3000 \
  --env-file .env \
  -v dongbang-data:/app/data \
  ghcr.io/<owner>/dongbang-booking:latest
```
main 브랜치에 푸시하면 GitHub Actions가 arm64/amd64 이미지를 GHCR로 자동 푸시한다.
```
```

- [ ] **Step 7: 최종 커밋**

```bash
git add -A
git commit -m "chore: Docker + GHCR CI + README"
```

---

## Self-Review 결과

**Spec coverage:**
- 방 2개 독립 예약 → Task 4(seed), 8/9(방별 그리드) ✓
- 30분 슬롯 → Task 2(SLOT_SECONDS, snap), 8(slotRows) ✓
- 구글 로그인(아무 계정) → Task 6 ✓
- 비로그인 읽기 전용 → Task 7(GET public), 8(메인 public) ✓
- 규칙 없음 + 겹침만 거절 → Task 2/5(validateReservation) ✓
- 팀 4종 + 색상 → Task 2(TEAMS/TEAM_COLORS), 8(렌더) ✓
- title 선택 입력 → Task 4(nullable), 9(모달) ✓
- 관리자(ADMIN_EMAIL) 전체열람/강제취소/방이름 → Task 3, 11 ✓
- SQLite 볼륨 → Task 4, 12 ✓
- GHCR CI → Task 12 ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "TBD/TODO" 없음. Task 8 Step 6의 임시 렌더는 Task 9에서 교체됨을 명시.

**Type consistency:** `createReservation` 반환 `{ok,id}`/`{ok,error}`, `validateReservation` 반환 형태 일치. `getSessionUser` 반환 `{email,name,isAdmin}` 이 API/페이지 전반에서 동일 사용. `Reservation`/`Room` 타입 단일 출처(queries.ts). `snapToSlot`·`overlaps`·`TEAMS`·`TEAM_COLORS` 이름 전 태스크 일관.

**주의 지점(실행자 유의):**
- Task 12 Step 1~2: standalone은 `server.js`를 만들고 커스텀 `server.ts`는 쓰지 않는다. 마이그레이션에 `tsx`가 필요하므로 `tsx`를 프로덕션 의존성으로 둔다.
- OAuth 실로그인은 자격증명이 있는 배포 환경에서만 최종 검증 가능 — 그전 태스크들은 빌드/단위테스트로 검증.
