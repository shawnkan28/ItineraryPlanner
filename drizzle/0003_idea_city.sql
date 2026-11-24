ALTER TABLE `idea` ADD `city_id` integer REFERENCES `trip_city`(`id`) ON DELETE set null;--> statement-breakpoint
INSERT OR IGNORE INTO `trip_city` (`trip_id`, `place_id`, `priority`, `position`, `nights_min`)
SELECT DISTINCT i.`trip_id`, s.`place_id`, 'must', 1000 + s.`position`, s.`nights`
FROM `idea` i JOIN `route_stop` s ON s.`id` = i.`base_id`
WHERE s.`place_id` IS NOT NULL AND s.`kind` = 'stay';--> statement-breakpoint
UPDATE `idea` SET `city_id` = (
	SELECT c.`id` FROM `route_stop` s JOIN `trip_city` c ON c.`place_id` = s.`place_id` AND c.`trip_id` = `idea`.`trip_id`
	WHERE s.`id` = `idea`.`base_id`
) WHERE `base_id` IS NOT NULL;
