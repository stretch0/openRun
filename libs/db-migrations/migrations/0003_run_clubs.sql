CREATE TABLE `club` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`timezone` text NOT NULL,
	`join_code` text NOT NULL,
	`require_approval` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_join_code_unique` ON `club` (`join_code`);--> statement-breakpoint
CREATE TABLE `club_location` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `club_location_club_idx` ON `club_location` (`club_id`);--> statement-breakpoint
CREATE TABLE `club_member` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`share_level` text DEFAULT 'attendance' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_member_club_user_idx` ON `club_member` (`club_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `club_member_user_idx` ON `club_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `club_run` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`series_id` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`location_id` text,
	`pace_groups` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`cancelled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `club_run_series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `club_location`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `club_run_club_starts_idx` ON `club_run` (`club_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `club_run_series_starts_idx` ON `club_run` (`series_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `club_run_series` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`title` text NOT NULL,
	`rrule` text NOT NULL,
	`starts_on` text NOT NULL,
	`start_time` text NOT NULL,
	`location_id` text,
	`pace_groups` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `club_location`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `club_run_series_club_idx` ON `club_run_series` (`club_id`);--> statement-breakpoint
CREATE TABLE `rsvp` (
	`id` text PRIMARY KEY NOT NULL,
	`club_run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`pace_group` text,
	`guests` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_run_id`) REFERENCES `club_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_run_user_idx` ON `rsvp` (`club_run_id`,`user_id`);