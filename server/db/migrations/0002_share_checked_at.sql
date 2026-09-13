-- IF NOT EXISTS: two cold instances can migrate at once right after a deploy.
ALTER TABLE "shares" ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
