import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

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
  /** 매주 반복으로 만든 예약들을 묶는 키. 단발 예약은 null. */
  series_id: text("series_id"),
});

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
