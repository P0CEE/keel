CREATE TYPE "public"."business_day_shift" AS ENUM('none', 'following', 'preceding');--> statement-breakpoint
CREATE TYPE "public"."recurring_amount_kind" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."recurring_cadence" AS ENUM('weekly', 'biweekly', 'four_weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."recurring_direction" AS ENUM('outflow', 'inflow');--> statement-breakpoint
CREATE TYPE "public"."recurring_ended_reason" AS ENUM('missed', 'member');--> statement-breakpoint
CREATE TYPE "public"."recurring_origin" AS ENUM('detected', 'member');--> statement-breakpoint
CREATE TYPE "public"."recurring_review" AS ENUM('suggested', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."recurring_state" AS ENUM('live', 'late', 'ended');--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"private_to" text,
	"mandate_ref" text,
	"counterparty_iban" text,
	"merchant_id" uuid,
	"merchant_key" text,
	"direction" "recurring_direction" NOT NULL,
	"flow" "transaction_flow" NOT NULL,
	"currency" char(3) NOT NULL,
	"account_id" uuid,
	"cadence" "recurring_cadence" NOT NULL,
	"cadence_pinned" boolean DEFAULT false NOT NULL,
	"schedule_origin" date NOT NULL,
	"anchor_day" smallint,
	"business_day_shift" "business_day_shift" DEFAULT 'none' NOT NULL,
	"amount_kind" "recurring_amount_kind" NOT NULL,
	"typical_amount_minor" bigint NOT NULL,
	"amount_low_minor" bigint NOT NULL,
	"amount_high_minor" bigint NOT NULL,
	"previous_amount_minor" bigint,
	"amount_changed_on" date,
	"name" text NOT NULL,
	"custom_name" text,
	"review" "recurring_review" DEFAULT 'suggested' NOT NULL,
	"state" "recurring_state" DEFAULT 'live' NOT NULL,
	"ended_reason" "recurring_ended_reason",
	"ended_on" date,
	"confidence" real NOT NULL,
	"origin" "recurring_origin" NOT NULL,
	"first_on" date NOT NULL,
	"last_on" date NOT NULL,
	"next_due_on" date,
	"occurrence_count" integer NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_series_signature" CHECK (num_nonnulls("recurring_series"."mandate_ref", "recurring_series"."counterparty_iban", "recurring_series"."merchant_id", "recurring_series"."merchant_key") > 0),
	CONSTRAINT "recurring_series_amounts" CHECK ("recurring_series"."amount_low_minor" > 0 AND "recurring_series"."amount_low_minor" <= "recurring_series"."typical_amount_minor" AND "recurring_series"."typical_amount_minor" <= "recurring_series"."amount_high_minor"),
	CONSTRAINT "recurring_series_previous_amount" CHECK ("recurring_series"."previous_amount_minor" IS NULL OR "recurring_series"."previous_amount_minor" > 0),
	CONSTRAINT "recurring_series_anchor" CHECK ("recurring_series"."anchor_day" IS NULL OR "recurring_series"."anchor_day" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_series_ended" CHECK (("recurring_series"."state" = 'ended') = ("recurring_series"."ended_reason" IS NOT NULL)),
	CONSTRAINT "recurring_series_currency" CHECK ("recurring_series"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "recurring_series_confidence" CHECK ("recurring_series"."confidence" >= 0 AND "recurring_series"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "recurring_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "mandate_ref" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_series_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_private_to_user_id_fk" FOREIGN KEY ("private_to") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_series_due_idx" ON "recurring_series" USING btree ("household_id","next_due_on") WHERE "recurring_series"."review" <> 'dismissed' AND "recurring_series"."state" <> 'ended';--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_series_id_recurring_series_id_fk" FOREIGN KEY ("recurring_series_id") REFERENCES "public"."recurring_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_recurring_idx" ON "transactions" USING btree ("recurring_series_id") WHERE "transactions"."recurring_series_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "recurring_series_scope" ON "recurring_series" AS PERMISSIVE FOR ALL TO "keel_app" USING ("recurring_series"."household_id" = keel_current_household() AND ("recurring_series"."private_to" IS NULL OR "recurring_series"."private_to" = keel_current_member())) WITH CHECK ("recurring_series"."household_id" = keel_current_household() AND ("recurring_series"."private_to" IS NULL OR "recurring_series"."private_to" = keel_current_member()));