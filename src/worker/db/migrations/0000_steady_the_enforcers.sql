CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_no` integer NOT NULL,
	`service_day` text NOT NULL,
	`destination` text NOT NULL,
	`table_label` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`change_pending` integer DEFAULT false NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`cancel_reason` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	`ready_at` integer,
	`served_at` integer,
	`linked_to` text
);
--> statement-breakpoint
CREATE INDEX `orders_status_service_day_idx` ON `orders` (`status`,`service_day`);