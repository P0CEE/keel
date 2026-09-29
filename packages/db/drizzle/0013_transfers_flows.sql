CREATE TYPE "public"."transaction_flow" AS ENUM('income', 'expense', 'savings_in', 'savings_out', 'transfer_in', 'transfer_out', 'internal', 'outside', 'unclassified');--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterpart_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_peer_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "flow" "transaction_flow" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "excluded_from_budget" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "excluded_from_analysis" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_account_id_bank_accounts_id_fk" FOREIGN KEY ("counterpart_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_peer_id_transactions_id_fk" FOREIGN KEY ("transfer_peer_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_peer_idx" ON "transactions" USING btree ("transfer_peer_id") WHERE "transactions"."transfer_peer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_counterpart_idx" ON "transactions" USING btree ("counterpart_account_id") WHERE "transactions"."counterpart_account_id" IS NOT NULL;--> statement-breakpoint
-- bank.daily-advance runs every hour and advances the households whose day
-- has just begun in their own time zone (the balance history reaches the
-- new day, series fall late or end). Ids only (ADR 0013).
CREATE FUNCTION keel_households_starting_day(at_hour integer, at_time timestamptz)
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT id FROM households
    WHERE extract(hour FROM at_time AT TIME ZONE timezone) = at_hour
    ORDER BY id
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION keel_households_starting_day(integer, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION keel_households_starting_day(integer, timestamptz) TO keel_app;
