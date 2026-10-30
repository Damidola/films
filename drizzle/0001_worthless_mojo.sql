ALTER TABLE `taste_feedback` ADD `bookmarked_at` integer;
--> statement-breakpoint
UPDATE `taste_feedback` SET `bookmarked_at` = `updated_at` WHERE `decision` = 'like';
