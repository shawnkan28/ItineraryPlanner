CREATE TABLE `city_day` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_city_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text,
	FOREIGN KEY (`trip_city_id`) REFERENCES `trip_city`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `idea` ADD `city_day_id` integer REFERENCES `city_day`(`id`) ON DELETE set null;