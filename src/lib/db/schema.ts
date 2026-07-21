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
