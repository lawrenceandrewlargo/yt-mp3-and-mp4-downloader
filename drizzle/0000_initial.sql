CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `download_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text DEFAULT 'Preparing media' NOT NULL,
	`thumbnail` text,
	`source` text DEFAULT '' NOT NULL,
	`request` text NOT NULL,
	`settings` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`output_filename` text,
	`output_relative_path` text,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);

--> statement-breakpoint
CREATE INDEX `jobs_status_created` ON `download_jobs` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`created_at` integer NOT NULL
);
