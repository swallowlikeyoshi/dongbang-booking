/**
 * 엑셀에서 이관한 과거 스터디 시간을 study_sessions 로 넣는다.
 *
 * 칸 하나(인원×이벤트)당 세션 하나를 만들고, 증명 등급을 "import" 로 표시해
 * QR 로 기록된 시간과 구분한다. start_proof='import' 인 기존 행을 먼저 지우므로
 * 엑셀이 갱신되면 그대로 다시 실행하면 된다.
 *
 * 실행: ROSTER_HISTORY_CSV=... node --import tsx src/lib/db/import-history.ts
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "./index";

const csvPath = process.env.HISTORY_CSV ?? "./data/history.csv";
/** 과거 기록은 시각까지 알 수 없다. 스터디가 흔한 저녁 시간에 몰아 넣는다. */
const START_HOUR = 19;

type Row = { name: string; event: string; date: string; hours: number };

/**
 * 최소 RFC4180 파서. 이벤트 라벨에 쉼표가 들어가는 경우가 실제로 있어
 * (예: "6/22,25 토크벡터링 작업") 단순 split 으로는 열이 밀린다.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [name, event, date, hours] = parseCsvLine(line);
    out.push({ name: name.trim(), event: event.trim(), date: date.trim(), hours: Number(hours) });
  }
  return out;
}

/** 'YYYY-MM-DD' + 시각 → Unix 초. 컨테이너 TZ 가 Asia/Seoul 로 고정돼 있다. */
function tsFor(date: string, hour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d, hour, 0, 0).getTime() / 1000);
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
const members = db.select().from(schema.members).all();
const byName = new Map(members.map((m) => [m.name, m]));

const removed = db.delete(schema.studySessions)
  .where(eq(schema.studySessions.start_proof, "import")).run();
console.log(`기존 이관분 삭제: ${removed.changes ?? 0}건`);

const now = Math.floor(Date.now() / 1000);
let added = 0;
const missing = new Set<string>();

for (const r of rows) {
  const member = byName.get(r.name);
  if (!member) { missing.add(r.name); continue; }
  const started = tsFor(r.date, START_HOUR);
  if (!Number.isFinite(started) || !Number.isFinite(r.hours) || r.hours <= 0) {
    throw new Error(`이관 행이 올바르지 않습니다: ${JSON.stringify(r)}`);
  }
  db.insert(schema.studySessions).values({
    member_id: member.id,
    room_id: 1,
    started_at: started,
    ended_at: started + Math.round(r.hours * 3600),
    start_proof: "import",
    end_proof: "import",
    status: "approved",
    note: `${r.event} (엑셀 이관)`,
    created_at: now,
  }).run();
  added++;
}

console.log(`이관 완료: ${added}건`);
if (missing.size) {
  console.log(`멤버가 없어 건너뜀: ${[...missing].join(", ")}`);
}
