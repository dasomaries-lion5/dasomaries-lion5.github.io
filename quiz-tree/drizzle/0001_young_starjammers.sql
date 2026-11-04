CREATE TABLE `room_pins` (
	`pin` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_pins_room_unique` ON `room_pins` (`room`);