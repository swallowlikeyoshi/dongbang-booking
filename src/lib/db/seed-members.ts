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
