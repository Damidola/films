CREATE TABLE `taste_feedback` (
	`user_id` text NOT NULL,
	`work_id` integer NOT NULL,
	`title` text NOT NULL,
	`decision` text,
	`watched` text,
	`good` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `work_id`)
);
