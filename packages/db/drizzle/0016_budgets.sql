CREATE TABLE "budget_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"level" smallint NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notify_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "budget_alerts_once" UNIQUE("member_id","category_id","month","level"),
	CONSTRAINT "budget_alerts_month" CHECK (extract(day from "budget_alerts"."month") = 1),
	CONSTRAINT "budget_alerts_level" CHECK ("budget_alerts"."level" IN (80, 100))
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"amount_minor" bigint,
	"currency" char(3) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_version" UNIQUE("household_id","category_id","effective_month"),
	CONSTRAINT "budgets_month" CHECK (extract(day from "budgets"."effective_month") = 1),
	CONSTRAINT "budgets_amount" CHECK ("budgets"."amount_minor" IS NULL OR "budgets"."amount_minor" > 0),
	CONSTRAINT "budgets_currency" CHECK ("budgets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "savings_targets" (
	"household_id" uuid NOT NULL,
	"effective_month" date NOT NULL,
	"amount_minor" bigint,
	"currency" char(3) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_targets_household_id_effective_month_pk" PRIMARY KEY("household_id","effective_month"),
	CONSTRAINT "savings_targets_month" CHECK (extract(day from "savings_targets"."effective_month") = 1),
	CONSTRAINT "savings_targets_amount" CHECK ("savings_targets"."amount_minor" IS NULL OR "savings_targets"."amount_minor" > 0),
	CONSTRAINT "savings_targets_currency" CHECK ("savings_targets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "savings_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_targets" ADD CONSTRAINT "savings_targets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_targets" ADD CONSTRAINT "savings_targets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "budget_alerts_scope" ON "budget_alerts" AS PERMISSIVE FOR ALL TO "keel_app" USING ("budget_alerts"."household_id" = keel_current_household() AND "budget_alerts"."member_id" = keel_current_member()) WITH CHECK ("budget_alerts"."household_id" = keel_current_household() AND "budget_alerts"."member_id" = keel_current_member());--> statement-breakpoint
CREATE POLICY "budgets_scope" ON "budgets" AS PERMISSIVE FOR ALL TO "keel_app" USING ("budgets"."household_id" = keel_current_household()) WITH CHECK ("budgets"."household_id" = keel_current_household());--> statement-breakpoint
CREATE POLICY "savings_targets_scope" ON "savings_targets" AS PERMISSIVE FOR ALL TO "keel_app" USING ("savings_targets"."household_id" = keel_current_household()) WITH CHECK ("savings_targets"."household_id" = keel_current_household());