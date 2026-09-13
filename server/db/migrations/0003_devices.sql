-- IF NOT EXISTS: two cold instances can migrate at once right after a deploy.
CREATE TABLE IF NOT EXISTS "devices" (
	"device_id" text PRIMARY KEY NOT NULL,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
