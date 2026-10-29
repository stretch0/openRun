CREATE TABLE `integration` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text,
	`credentials` text NOT NULL,
	`sync_from` integer NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_user_provider_idx` ON `integration` (`user_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_account_idx` ON `integration` (`provider`,`account_id`);--> statement-breakpoint
CREATE TABLE `integration_item` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`external_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`status` text NOT NULL,
	`activity_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_item_external_idx` ON `integration_item` (`integration_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `integration_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`imported` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`unavailable` integer DEFAULT 0 NOT NULL,
	`more` integer DEFAULT false NOT NULL,
	`error` text,
	FOREIGN KEY (`integration_id`) REFERENCES `integration`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `integration_sync_idx` ON `integration_sync` (`integration_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `activity` ADD `device` text;--> statement-breakpoint
ALTER TABLE `club_share` ADD `device` text;