CREATE TYPE "public"."circle_status" AS ENUM('forming', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('open', 'settling', 'settled');--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"share_amount" bigint NOT NULL,
	"currency" text DEFAULT 'NIM' NOT NULL,
	"frequency" "frequency" NOT NULL,
	"member_count" integer NOT NULL,
	"status" "circle_status" DEFAULT 'forming' NOT NULL,
	"created_by_device" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"display_name" text NOT NULL,
	"address" text NOT NULL,
	"device_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "round_status" DEFAULT 'open' NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"payer_member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"tx_hash" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_recipient_member_id_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_payer_member_id_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_confirmed_by_members_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circles_code_key" ON "circles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "members_circle_position_key" ON "members" USING btree ("circle_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "members_circle_device_key" ON "members" USING btree ("circle_id","device_id");--> statement-breakpoint
CREATE INDEX "members_circle_idx" ON "members" USING btree ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_circle_number_key" ON "rounds" USING btree ("circle_id","number");--> statement-breakpoint
CREATE INDEX "rounds_circle_idx" ON "rounds" USING btree ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_round_payer_key" ON "shares" USING btree ("round_id","payer_member_id");--> statement-breakpoint
CREATE INDEX "shares_round_idx" ON "shares" USING btree ("round_id");