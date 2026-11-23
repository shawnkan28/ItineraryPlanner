CREATE TABLE `attachment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`caption` text,
	FOREIGN KEY (`day_id`) REFERENCES `day`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `booking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`day_id` integer,
	`plan_item_id` integer,
	`stay_id` integer,
	`category` text DEFAULT 'check' NOT NULL,
	`title` text NOT NULL,
	`provider` text,
	`url` text,
	`tasks` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'to_book' NOT NULL,
	`opens_on` text,
	`book_by` text,
	`confirmation` text,
	`price_minor` integer,
	`currency` text,
	`cancellation` text,
	`notes` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `day`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_item_id`) REFERENCES `plan_item`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`stay_id`) REFERENCES `stay`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `day` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`day_number` integer NOT NULL,
	`date` text NOT NULL,
	`title_place_id` integer,
	`base_label` text,
	`summary` text,
	`stay_id` integer,
	`stay_note` text,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`stay_id`) REFERENCES `stay`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `decision` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`question` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`answer` text,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `export_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`run_at` text NOT NULL,
	`target` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `idea` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`base_id` integer,
	`place_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'idea' NOT NULL,
	`reason` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_id`) REFERENCES `route_stop`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `journal_entry` (
	`day_id` integer PRIMARY KEY NOT NULL,
	`quick_summary` text,
	`highlights` text,
	`lowlight` text,
	`log_morning` text,
	`log_afternoon` text,
	`log_evening` text,
	`breakfast` text,
	`lunch` text,
	`dinner` text,
	`tips` text,
	`banner` text,
	`updated_at` text,
	FOREIGN KEY (`day_id`) REFERENCES `day`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `place` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`level` text DEFAULT 'place' NOT NULL,
	`parent_id` integer,
	`aliases` text DEFAULT '[]' NOT NULL,
	`vault_path` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_name_unique` ON `place` (`name`);--> statement-breakpoint
CREATE TABLE `plan_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`time_label` text,
	`sort_time` text,
	`title` text NOT NULL,
	`place_id` integer,
	`person` text,
	`details` text DEFAULT '[]' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`section_id`) REFERENCES `plan_section`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `plan_section` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`collapsed` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `day`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `route_option` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`name` text NOT NULL,
	`is_chosen` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `route_stop` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_option_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`place_id` integer,
	`label` text,
	`nights` integer DEFAULT 1 NOT NULL,
	`start_date` text,
	`kind` text DEFAULT 'stay' NOT NULL,
	FOREIGN KEY (`route_option_id`) REFERENCES `route_option`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `stay` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`base_id` integer,
	`hotel` text NOT NULL,
	`place_id` integer,
	`url` text,
	`address` text,
	`location` text,
	`price_minor` integer,
	`currency` text,
	`check_in` text,
	`check_out` text,
	`booked_via` text,
	`status` text DEFAULT 'idea' NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_id`) REFERENCES `route_stop`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `trip` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`travellers` text DEFAULT '["me"]' NOT NULL,
	`home_currency` text DEFAULT 'SGD' NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`notes` text,
	`created_by` integer,
	`updated_by` integer
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
