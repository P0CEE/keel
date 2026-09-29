-- Cash withdrawals get their own leaf (taxonomy review of 2026-09-29): ramnn
-- had none, and the model filed ATM withdrawals under movements.other, a
-- transfer out, so cash left the spending, the budgets and the monthly
-- review. Same id scheme as 0012: UUID v8 of md5("keel:taxonomy:other.cash").
INSERT INTO "categories" ("id", "parent_id", "key", "name", "nature", "color", "icon", "is_catch_all") VALUES
  ('9726a153-7e6f-888c-82b6-56d1fe06017d', '0e78c758-95a8-86b5-94f8-62041b66dd51', 'other.cash', 'Cash withdrawals', 'expense', 'mauve', 'receipt', false)
ON CONFLICT ("key") WHERE "household_id" IS NULL DO UPDATE SET "name" = EXCLUDED."name", "nature" = EXCLUDED."nature", "color" = EXCLUDED."color", "icon" = EXCLUDED."icon", "is_catch_all" = EXCLUDED."is_catch_all";--> statement-breakpoint
-- The withdrawals an automatic decision filed elsewhere move to it; a
-- member's or a mapping's choice stays. The next reconciliation gives them
-- their flow (expense).
UPDATE "transactions" SET "category_id" = '9726a153-7e6f-888c-82b6-56d1fe06017d', "category_mapping_id" = NULL, "updated_at" = now()
WHERE "method" = 'cash_withdrawal'
  AND "category_source" IN ('dictionary', 'history', 'model')
  AND "category_id" IS DISTINCT FROM '9726a153-7e6f-888c-82b6-56d1fe06017d';
