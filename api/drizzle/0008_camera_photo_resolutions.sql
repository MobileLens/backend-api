ALTER TABLE `camera` ADD `photo_resolutions_mp` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Dotychczasowa aktywna rozdzielczość jako jednoelementowa lista (gdy równa rozdzielczości matrycy - też jedna wartość).
UPDATE `camera` SET `photo_resolutions_mp` = json_array(`active_resolution_mp`);
