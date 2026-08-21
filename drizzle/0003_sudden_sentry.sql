CREATE TABLE `device_heartbeats` (
	`room_id` integer PRIMARY KEY NOT NULL,
	`last_seen_at` integer NOT NULL,
	`firmware` text
);
--> statement-breakpoint
CREATE TABLE `pending_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`scanned_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `session_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`editor_email` text NOT NULL,
	`edited_at` integer NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`room_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`start_proof` text NOT NULL,
	`end_proof` text,
	`status` text NOT NULL,
	`note` text,
	`report_lat` real,
	`report_lng` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `used_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`used_at` integer NOT NULL
);
