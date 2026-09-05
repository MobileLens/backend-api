PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`alg` text,
	`crv` text
);
--> statement-breakpoint
INSERT INTO `__new_jwks`("id", "public_key", "private_key", "created_at", "alg", "crv") SELECT "id", "public_key", "private_key", "created_at", "alg", "crv" FROM `jwks`;--> statement-breakpoint
DROP TABLE `jwks`;--> statement-breakpoint
ALTER TABLE `__new_jwks` RENAME TO `jwks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;