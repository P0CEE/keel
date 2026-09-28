CREATE TYPE "public"."account_kind" AS ENUM('current', 'savings', 'card', 'loan', 'other');--> statement-breakpoint
CREATE TYPE "public"."bank_provider" AS ENUM('enable_banking', 'fake');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'reconnect_required', 'removed');--> statement-breakpoint
CREATE TYPE "public"."kind_set_by" AS ENUM('provider', 'member');--> statement-breakpoint
CREATE TYPE "public"."provider_error_kind" AS ENUM('reconnect_required', 'rate_limited', 'transient', 'bank_unavailable', 'psu_required', 'invalid_request');--> statement-breakpoint
CREATE TYPE "public"."psu_type" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid,
	"owner_id" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"provider_account_ref" text,
	"stable_ref" text,
	"provider_name" text,
	"custom_name" text,
	"kind" "account_kind" NOT NULL,
	"kind_set_by" "kind_set_by" NOT NULL,
	"currency" char(3) NOT NULL,
	"iban" text,
	"balance_minor" bigint,
	"balance_as_of" date,
	"declared_balance_minor" bigint,
	"declared_on" date,
	"hidden" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_manual_anchor" CHECK (("bank_accounts"."connection_id" IS NULL) = ("bank_accounts"."declared_on" IS NOT NULL AND "bank_accounts"."declared_balance_minor" IS NOT NULL)),
	CONSTRAINT "bank_accounts_synced_refs" CHECK ("bank_accounts"."connection_id" IS NULL OR ("bank_accounts"."stable_ref" IS NOT NULL AND "bank_accounts"."provider_account_ref" IS NOT NULL)),
	CONSTRAINT "bank_accounts_private_owner" CHECK (NOT "bank_accounts"."is_private" OR "bank_accounts"."owner_id" IS NOT NULL),
	CONSTRAINT "bank_accounts_currency" CHECK ("bank_accounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"consented_by" text NOT NULL,
	"institution_id" uuid NOT NULL,
	"provider" "bank_provider" NOT NULL,
	"psu_type" "psu_type" DEFAULT 'personal' NOT NULL,
	"provider_session_ref" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"consent_expires_at" timestamp with time zone NOT NULL,
	"next_sync_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"last_error_kind" "provider_error_kind",
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_connections_removed_at" CHECK (("bank_connections"."status" = 'removed') = ("bank_connections"."removed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "bank_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" "bank_provider" NOT NULL,
	"provider_ref" text NOT NULL,
	"name" text NOT NULL,
	"country" char(2) NOT NULL,
	"logo_url" text,
	"psu_types" "psu_type"[] NOT NULL,
	"required_psu_headers" text[] NOT NULL,
	"max_consent_days" integer,
	"max_history_days" integer,
	"popularity" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" char(3) NOT NULL,
	"day" date NOT NULL,
	"per_eur" numeric(20, 10) NOT NULL,
	CONSTRAINT "fx_rates_currency_day_pk" PRIMARY KEY("currency","day"),
	CONSTRAINT "fx_rates_positive" CHECK ("fx_rates"."per_eur" > 0)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_consented_by_user_id_fk" FOREIGN KEY ("consented_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_household_idx" ON "bank_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_connection_stable_ref_key" ON "bank_accounts" USING btree ("connection_id","stable_ref") WHERE "bank_accounts"."connection_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_session_key" ON "bank_connections" USING btree ("provider","provider_session_ref");--> statement-breakpoint
CREATE INDEX "bank_connections_household_idx" ON "bank_connections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "bank_connections_next_sync_idx" ON "bank_connections" USING btree ("next_sync_at") WHERE "bank_connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "bank_connections_consent_expiry_idx" ON "bank_connections" USING btree ("consent_expires_at") WHERE "bank_connections"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_provider_ref_key" ON "institutions" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "institutions_country_idx" ON "institutions" USING btree ("country","active");--> statement-breakpoint
CREATE INDEX "institutions_name_trgm_idx" ON "institutions" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE POLICY "bank_accounts_scope" ON "bank_accounts" AS PERMISSIVE FOR ALL TO "keel_app" USING ("bank_accounts"."household_id" = keel_current_household() AND (NOT "bank_accounts"."is_private" OR "bank_accounts"."owner_id" = keel_current_member())) WITH CHECK ("bank_accounts"."household_id" = keel_current_household() AND (NOT "bank_accounts"."is_private" OR "bank_accounts"."owner_id" = keel_current_member()));--> statement-breakpoint
CREATE POLICY "bank_connections_scope" ON "bank_connections" AS PERMISSIVE FOR ALL TO "keel_app" USING ("bank_connections"."household_id" = keel_current_household()) WITH CHECK ("bank_connections"."household_id" = keel_current_household());