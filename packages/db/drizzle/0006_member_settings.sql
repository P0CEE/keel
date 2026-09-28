CREATE TYPE "public"."member_locale" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TABLE "member_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"locale" "member_locale" NOT NULL,
	"display_currency" char(3),
	"home_layout" jsonb,
	"onboarded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "member_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_settings" ADD CONSTRAINT "member_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_settings" ADD CONSTRAINT "member_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "member_settings_scope" ON "member_settings" AS PERMISSIVE FOR ALL TO "keel_app" USING ("member_settings"."household_id" = keel_current_household() AND "member_settings"."user_id" = keel_current_member()) WITH CHECK ("member_settings"."household_id" = keel_current_household() AND "member_settings"."user_id" = keel_current_member());