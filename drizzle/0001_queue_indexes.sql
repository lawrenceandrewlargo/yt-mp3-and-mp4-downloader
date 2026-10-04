CREATE INDEX `jobs_execution_queue` ON `download_jobs` (`execution_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `searches_created` ON `search_history` (`created_at`);