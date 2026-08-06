ALTER TABLE `lessons` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `file_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `pdf_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `status_message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `summary_json` text;--> statement-breakpoint
ALTER TABLE `objectives` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `objectives` ADD `difficulty` text DEFAULT 'beginner' NOT NULL;