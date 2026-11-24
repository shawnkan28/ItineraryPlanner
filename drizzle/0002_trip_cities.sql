CREATE TABLE `trip_city` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`place_id` integer NOT NULL,
	`priority` text DEFAULT 'maybe' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`nights_min` integer DEFAULT 1 NOT NULL,
	`nights_max` integer,
	`notes` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_city_trip_place` ON `trip_city` (`trip_id`,`place_id`);