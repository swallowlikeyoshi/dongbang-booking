import fs from "node:fs";
import { db, schema } from "./index";
import { getMemberByStudentNo } from "./members";
import { SUB_TEAMS } from "../constants";

const csvPath = process.env.ROSTER_CSV ?? "./data/roster.csv";
const text = fs.readFileSync(csvPath, "utf-8").trim();
const lines = text.split("\n").slice(1);
const now = Math.floor(Date.now() / 1000);

const VALID_SUB_TEAMS = new Set<string>(SUB_TEAMS);

let added = 0;
lines.forEach((line, idx) => {
  const [student_no, name, sub_team] = line.split(",").map((s) => s.trim());
  if (!student_no) return;
  if (!VALID_SUB_TEAMS.has(sub_team)) {
    // 표기·공백 오차 한 글자만으로 팀 히트맵/순위 색상에서 조용히 빠지는 사고를
    // 방지한다 — 알 수 없는 세부팀은 절대 조용히 넣지 말고 즉시 실패한다.
    throw new Error(
      `seed-members: 알 수 없는 sub_team "${sub_team}" (행 ${idx + 2}: ${line}). ` +
      `허용값: ${SUB_TEAMS.join(", ")}`,
    );
  }
  if (getMemberByStudentNo(student_no)) return;
  db.insert(schema.members).values({ student_no, name, sub_team, status: "seeded", created_at: now }).run();
  added++;
});
console.log(`seed-members done: +${added}`);
