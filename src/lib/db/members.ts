import { eq, desc } from "drizzle-orm";
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

export function getMemberById(id: number): Member | null {
  const rows = db.select().from(schema.members).where(eq(schema.members.id, id)).all();
  return rows[0] ?? null;
}

export type MemberEdit = typeof schema.memberEdits.$inferSelect;

/**
 * 잘못 클레임된 학번을 관리자가 풀어준다. 구글 계정 연결만 끊는다 — 멤버
 * row 나 세션(누적 시간)은 건드리지 않는다. 학번은 이후 다른 계정이 다시
 * 클레임할 수 있게 된다.
 *
 * 이전 이메일이 사라지면 재클레임 시 "누구의 누적 시간이었는지"를 되짚을
 * 방법이 없어지므로, 언바인드마다 member_edits 에 감사 기록을 남긴다.
 */
export function unbindMember(
  memberId: number,
  editorEmail: string,
  reason?: string,
): { ok: true } | { ok: false; error: string } {
  const existing = getMemberById(memberId);
  if (!existing) return { ok: false, error: "존재하지 않는 멤버입니다." };
  if (!existing.user_email) return { ok: false, error: "이미 언바인드된 멤버입니다." };

  db.update(schema.members)
    .set({ user_email: null })
    .where(eq(schema.members.id, memberId))
    .run();
  db.insert(schema.memberEdits).values({
    member_id: memberId,
    editor_email: editorEmail,
    edited_at: Math.floor(Date.now() / 1000),
    before_email: existing.user_email,
    after_email: null,
    reason: reason ?? null,
  }).run();
  return { ok: true };
}

export function listMemberEdits(limit = 20): MemberEdit[] {
  return db.select().from(schema.memberEdits)
    .orderBy(desc(schema.memberEdits.edited_at))
    .limit(limit)
    .all();
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
