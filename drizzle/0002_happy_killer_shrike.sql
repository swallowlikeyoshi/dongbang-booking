CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_no` text NOT NULL,
	`name` text NOT NULL,
	`sub_team` text NOT NULL,
	`user_email` text,
	`status` text DEFAULT 'seeded' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_student_no_unique` ON `members` (`student_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_email_unique` ON `members` (`user_email`);