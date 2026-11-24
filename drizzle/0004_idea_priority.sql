ALTER TABLE `idea` ADD `priority` text DEFAULT 'maybe' NOT NULL;--> statement-breakpoint
UPDATE `idea` SET `priority` = 'skip', `status` = 'idea' WHERE `status` = 'dropped';
