CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `display_receipts` (
	`order_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer NOT NULL,
	`rendered_at` integer NOT NULL,
	PRIMARY KEY(`order_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `enroll_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`secret_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`approved_role` text,
	`approved_label` text,
	`created_ip_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_idr` integer NOT NULL,
	`category` text NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`modifier_groups_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`day` text NOT NULL,
	`name` text NOT NULL,
	`count` integer NOT NULL,
	`sum` integer NOT NULL,
	`max` integer NOT NULL,
	PRIMARY KEY(`day`, `name`)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`actor_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`acked_at` integer,
	`acked_by` text
);
--> statement-breakpoint
CREATE INDEX `order_changes_order_id_idx` ON `order_changes` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`type` text NOT NULL,
	`staff_id` text,
	`device_id` text,
	`manager_user` text,
	`payload_json` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_events_order_id_idx` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`price_snapshot` integer NOT NULL,
	`qty` integer NOT NULL,
	`modifiers_json` text DEFAULT '[]' NOT NULL,
	`note` text,
	`allergy` text,
	`added_in_version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_lines_order_id_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text,
	`pin_salt` text,
	`disabled_at` integer
);
--> statement-breakpoint
CREATE TABLE `tables` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `order_note` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelled_at` integer;--> statement-breakpoint
CREATE INDEX `orders_served_at_idx` ON `orders` (`served_at`);--> statement-breakpoint
CREATE INDEX `orders_cancelled_at_idx` ON `orders` (`cancelled_at`);