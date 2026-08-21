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
