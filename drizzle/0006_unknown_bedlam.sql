CREATE TABLE `member_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`editor_email` text NOT NULL,
	`edited_at` integer NOT NULL,
	`before_email` text,
	`after_email` text,
	`reason` text
);
