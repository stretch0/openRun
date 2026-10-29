CREATE TABLE `club_share` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`club_run_id` text,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`distance_m` real NOT NULL,
	`duration_s` real NOT NULL,
	`track` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`club_run_id`) REFERENCES `club_run`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_share_club_source_idx` ON `club_share` (`club_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `club_share_run_idx` ON `club_share` (`club_run_id`);--> statement-breakpoint
ALTER TABLE `club_member` ADD `highlights` integer DEFAULT false NOT NULL;