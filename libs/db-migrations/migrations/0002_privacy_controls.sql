CREATE TABLE `privacy_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_visibility` text DEFAULT 'private' NOT NULL,
	`share_map` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `privacy_zone` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius_m` real NOT NULL,
	`trim_lat` real NOT NULL,
	`trim_lng` real NOT NULL,
	`trim_radius_m` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `privacy_zone_user_id_idx` ON `privacy_zone` (`user_id`);--> statement-breakpoint
ALTER TABLE `activity` ADD `visibility` text DEFAULT 'private' NOT NULL;