-- The search reads labels without accents (R2). unaccent is a trusted
-- extension, so the migrating role may create it. unaccent() itself is only
-- STABLE (its dictionary could change), which a generated column refuses:
-- keel_unaccent pins the dictionary and is declared IMMUTABLE, the usual way.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE FUNCTION keel_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
CREATE TYPE "public"."balance_source" AS ENUM('provider', 'reconstructed', 'declared');--> statement-breakpoint
CREATE TYPE "public"."transaction_method" AS ENUM('card', 'cash_withdrawal', 'transfer', 'direct_debit', 'fee', 'interest', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_origin" AS ENUM('provider', 'csv', 'manual');--> statement-breakpoint
CREATE TABLE "account_balances" (
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"household_id" uuid NOT NULL,
	"private_to" text,
	"balance_minor" bigint NOT NULL,
	"source" "balance_source" NOT NULL,
	CONSTRAINT "account_balances_account_id_day_pk" PRIMARY KEY("account_id","day")
);
--> statement-breakpoint
ALTER TABLE "account_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"private_to" text,
	"origin" "transaction_origin" NOT NULL,
	"provider_ref" text,
	"fingerprint" text,
	"occurrence" smallint,
	"purchased_on" date NOT NULL,
	"booked_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"label" text NOT NULL,
	"raw" jsonb,
	"counterparty_name" text,
	"counterparty_iban" text,
	"mcc" text,
	"bank_code" text,
	"method" "transaction_method" NOT NULL,
	"merchant_key" text,
	"labels_version" smallint NOT NULL,
	"display_name" text,
	"note" text,
	"search_text" text GENERATED ALWAYS AS (lower(keel_unaccent("transactions"."label" || ' ' || coalesce("transactions"."display_name", '') || ' ' || coalesce("transactions"."counterparty_name", '') || ' ' || coalesce("transactions"."note", '')))) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_nonzero" CHECK ("transactions"."amount_minor" <> 0),
	CONSTRAINT "transactions_currency" CHECK ("transactions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "transactions_identity" CHECK (("transactions"."fingerprint" IS NULL) = ("transactions"."occurrence" IS NULL) AND ("transactions"."origin" = 'manual' OR "transactions"."fingerprint" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "history_dirty_from" date;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
-- The composite foreign key below targets this pair.
CREATE UNIQUE INDEX "bank_accounts_household_key" ON "bank_accounts" USING btree ("id","household_id");--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_private_to_user_id_fk" FOREIGN KEY ("private_to") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_private_to_user_id_fk" FOREIGN KEY ("private_to") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("account_id","household_id") REFERENCES "public"."bank_accounts"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_household_purchased_idx" ON "transactions" USING btree ("household_id","purchased_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_search_trgm_idx" ON "transactions" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "transactions_account_booked_idx" ON "transactions" USING btree ("account_id","booked_on");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_ref_key" ON "transactions" USING btree ("account_id","provider_ref") WHERE "transactions"."provider_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_fingerprint_key" ON "transactions" USING btree ("account_id","fingerprint","occurrence");--> statement-breakpoint
CREATE POLICY "account_balances_scope" ON "account_balances" AS PERMISSIVE FOR ALL TO "keel_app" USING ("account_balances"."household_id" = keel_current_household() AND ("account_balances"."private_to" IS NULL OR "account_balances"."private_to" = keel_current_member())) WITH CHECK ("account_balances"."household_id" = keel_current_household() AND ("account_balances"."private_to" IS NULL OR "account_balances"."private_to" = keel_current_member()));--> statement-breakpoint
CREATE POLICY "transactions_scope" ON "transactions" AS PERMISSIVE FOR ALL TO "keel_app" USING ("transactions"."household_id" = keel_current_household() AND ("transactions"."private_to" IS NULL OR "transactions"."private_to" = keel_current_member())) WITH CHECK ("transactions"."household_id" = keel_current_household() AND ("transactions"."private_to" IS NULL OR "transactions"."private_to" = keel_current_member()));