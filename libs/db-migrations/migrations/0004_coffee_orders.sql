CREATE TABLE `coffee_order` (
	`id` text PRIMARY KEY NOT NULL,
	`club_run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`menu_item_id` text,
	`item` text NOT NULL,
	`choices` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_run_id`) REFERENCES `club_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coffee_order_run_user_idx` ON `coffee_order` (`club_run_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `coffee_usual` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`user_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`choices` text DEFAULT '[]' NOT NULL,
	`auto_add` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coffee_usual_club_user_idx` ON `coffee_usual` (`club_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `menu_item` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`name` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `club`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_item_club_idx` ON `menu_item` (`club_id`);--> statement-breakpoint
ALTER TABLE `club_run` ADD `order_cutoff_min` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `club_run_series` ADD `order_cutoff_min` integer DEFAULT 0 NOT NULL;