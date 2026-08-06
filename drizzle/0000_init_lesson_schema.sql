CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`selected_option` text NOT NULL,
	`correct` integer NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`difficulty` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`title` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`objective_id` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`correct_answer` text NOT NULL,
	`hint` text NOT NULL,
	`explanation` text NOT NULL,
	FOREIGN KEY (`objective_id`) REFERENCES `objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `student_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`current_objective` text,
	`score` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
