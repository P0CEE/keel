CREATE TYPE "public"."category_nature" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('user', 'mapping', 'history', 'dictionary', 'model');--> statement-breakpoint
CREATE TYPE "public"."mapping_matcher" AS ENUM('merchant', 'keyword');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"parent_id" uuid,
	"key" text,
	"name" text NOT NULL,
	"nature" "category_nature" NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"is_catch_all" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "category_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"private_to" text,
	"transaction_id" uuid NOT NULL,
	"from_category_id" uuid,
	"from_source" "category_source",
	"from_confidence" real,
	"to_category_id" uuid NOT NULL,
	"label" text NOT NULL,
	"merchant_key" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"corrected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "category_undos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_undos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "merchant_logos" (
	"domain" text PRIMARY KEY NOT NULL,
	"content_type" text,
	"bytes" "bytea",
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"matcher" "mapping_matcher" NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_source" "category_source";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_mapping_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "categorized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_private_to_user_id_fk" FOREIGN KEY ("private_to") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_corrected_by_user_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_undos" ADD CONSTRAINT "category_undos_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_undos" ADD CONSTRAINT "category_undos_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_mappings" ADD CONSTRAINT "merchant_mappings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_mappings" ADD CONSTRAINT "merchant_mappings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_mappings" ADD CONSTRAINT "merchant_mappings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_system_key" ON "categories" USING btree ("key") WHERE "categories"."household_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_name_key" ON "categories" USING btree ("household_id","parent_id","name") WHERE "categories"."household_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "category_corrections_household_idx" ON "category_corrections" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_mappings_pattern_key" ON "merchant_mappings" USING btree ("household_id","matcher","pattern");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_mapping_id_merchant_mappings_id_fk" FOREIGN KEY ("category_mapping_id") REFERENCES "public"."merchant_mappings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_pending_idx" ON "transactions" USING btree ("household_id") WHERE "transactions"."categorized_at" IS NULL AND "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_merchant_key_idx" ON "transactions" USING btree ("household_id","merchant_key") WHERE "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_review_idx" ON "transactions" USING btree ("household_id") WHERE "transactions"."needs_review" AND "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_mapping_idx" ON "transactions" USING btree ("category_mapping_id") WHERE "transactions"."category_mapping_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "categories_read" ON "categories" AS PERMISSIVE FOR SELECT TO "keel_app" USING ("categories"."household_id" IS NULL OR "categories"."household_id" = keel_current_household());--> statement-breakpoint
CREATE POLICY "categories_write" ON "categories" AS PERMISSIVE FOR INSERT TO "keel_app" WITH CHECK ("categories"."household_id" = keel_current_household());--> statement-breakpoint
CREATE POLICY "categories_update" ON "categories" AS PERMISSIVE FOR UPDATE TO "keel_app" USING ("categories"."household_id" = keel_current_household()) WITH CHECK ("categories"."household_id" = keel_current_household());--> statement-breakpoint
CREATE POLICY "category_corrections_scope" ON "category_corrections" AS PERMISSIVE FOR ALL TO "keel_app" USING ("category_corrections"."household_id" = keel_current_household() AND ("category_corrections"."private_to" IS NULL OR "category_corrections"."private_to" = keel_current_member())) WITH CHECK ("category_corrections"."household_id" = keel_current_household() AND ("category_corrections"."private_to" IS NULL OR "category_corrections"."private_to" = keel_current_member()));--> statement-breakpoint
CREATE POLICY "category_undos_scope" ON "category_undos" AS PERMISSIVE FOR ALL TO "keel_app" USING ("category_undos"."household_id" = keel_current_household() AND "category_undos"."created_by" = keel_current_member()) WITH CHECK ("category_undos"."household_id" = keel_current_household() AND "category_undos"."created_by" = keel_current_member());--> statement-breakpoint
CREATE POLICY "merchant_mappings_scope" ON "merchant_mappings" AS PERMISSIVE FOR ALL TO "keel_app" USING ("merchant_mappings"."household_id" = keel_current_household()) WITH CHECK ("merchant_mappings"."household_id" = keel_current_household());--> statement-breakpoint
-- The system taxonomy (ADR 0012), seeded from @keel/finance/taxonomy. Ids are
-- UUID v8 of the md5 of "keel:taxonomy:<key>", so every environment shares them. A new taxonomy
-- version is a new migration of the same upserts: keys are never renamed.
INSERT INTO "categories" ("id", "parent_id", "key", "name", "nature", "color", "icon", "is_catch_all") VALUES
  ('f7a55a7e-a4a3-871f-b710-b52673f1e4d3', NULL, 'income', 'Income', 'income', 'green', 'income', false),
  ('0844effa-a7f2-89fa-991f-36eafa226767', NULL, 'movements', 'Internal movements', 'transfer', 'mauve', 'transfer', false),
  ('e81a2694-7370-8546-85ed-dd5a30ac4edf', NULL, 'housing', 'Housing', 'expense', 'purple', 'housing', false),
  ('3c21194d-b07e-896b-9fe0-daecbb918ad2', NULL, 'food', 'Food & Groceries', 'expense', 'orange', 'dining', false),
  ('5a54d483-0c09-81a4-956c-6e732a090918', NULL, 'transport', 'Transport', 'expense', 'blue', 'transport', false),
  ('5e632f76-8dcc-82e6-9db3-d2f64a72b67e', NULL, 'health', 'Health', 'expense', 'green-light', 'health', false),
  ('7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', NULL, 'shopping', 'Shopping & Personal', 'expense', 'yellow', 'shopping', false),
  ('0a98de4a-2651-86d8-b096-24a90b6c7e90', NULL, 'leisure', 'Leisure & Outings', 'expense', 'pink', 'entertainment', false),
  ('9b2aaef1-8d80-8951-b97a-14856f4ed12a', NULL, 'travel', 'Travel', 'expense', 'green-deep', 'travel', false),
  ('8491f1fe-a371-8a43-bc55-b807b4f9cdb1', NULL, 'family', 'Family & Education', 'expense', 'blue', 'baby', false),
  ('e37f0559-bb60-8494-8e45-f698e6696f0f', NULL, 'telecom', 'Telecom & Software', 'expense', 'purple', 'bolt', false),
  ('50b95c4f-ef3d-86aa-a8ee-c56cbb197b6b', NULL, 'taxes', 'Taxes', 'expense', 'yellow', 'building', false),
  ('e5844ba0-fecc-87c8-8e0b-636c7cd2dcb9', NULL, 'bank', 'Bank & Credits', 'expense', 'mauve', 'bank', false),
  ('0e78c758-95a8-86b5-94f8-62041b66dd51', NULL, 'other', 'Other Expenses', 'expense', 'mauve', 'receipt', false)
ON CONFLICT ("key") WHERE "household_id" IS NULL DO UPDATE SET "name" = EXCLUDED."name", "nature" = EXCLUDED."nature", "color" = EXCLUDED."color", "icon" = EXCLUDED."icon", "is_catch_all" = EXCLUDED."is_catch_all";--> statement-breakpoint
INSERT INTO "categories" ("id", "parent_id", "key", "name", "nature", "color", "icon", "is_catch_all") VALUES
  ('e502ddbc-17d3-83eb-8de8-b546794be39a', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.salary', 'Salary', 'income', 'green', 'income', false),
  ('e575f396-886d-8dbb-852f-005dbe51046e', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.pension', 'Pension', 'income', 'green', 'income', false),
  ('77ceaac0-bf35-81c1-8f31-e896c8b277c7', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.benefits', 'Benefits', 'income', 'green', 'income', false),
  ('1b1eac19-b369-8103-ad3a-859f2edabbbc', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.investments', 'Investment income', 'income', 'green', 'income', false),
  ('51ab4bd3-e8e2-896c-b741-ddda298cf91b', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.rental', 'Rental income', 'income', 'green', 'income', false),
  ('e294b5d7-1f68-8cb9-bb7a-0dcce233ad46', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.refunds', 'Reimbursements', 'income', 'green', 'income', false),
  ('94f3fee2-4d70-884f-8030-91e55183aa5b', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.gifts', 'Money received', 'income', 'green', 'income', false),
  ('d100a1ab-2f33-8196-aab7-08ef6e33a31f', 'f7a55a7e-a4a3-871f-b710-b52673f1e4d3', 'income.other', 'Other: Income', 'income', 'green', 'income', true),
  ('5162de4d-0997-8862-a3c0-a338c7b44be7', '0844effa-a7f2-89fa-991f-36eafa226767', 'movements.transfers', 'Transfers', 'transfer', 'mauve', 'transfer', false),
  ('5ccd2978-1113-88ba-927c-3cfd91e4432a', '0844effa-a7f2-89fa-991f-36eafa226767', 'movements.savings', 'Savings', 'transfer', 'mauve', 'transfer', false),
  ('f220458b-70b1-816f-94ac-a942f338a3c1', '0844effa-a7f2-89fa-991f-36eafa226767', 'movements.securities', 'Securities', 'transfer', 'mauve', 'transfer', false),
  ('1042ca2b-4fca-8727-a9a6-b8595600e1eb', '0844effa-a7f2-89fa-991f-36eafa226767', 'movements.other', 'Other: Internal movements', 'transfer', 'mauve', 'transfer', true),
  ('9c5666f6-90d1-8296-9174-afb963f05cb3', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.rent', 'Rent', 'expense', 'purple', 'housing', false),
  ('77f39927-81a4-8c26-8387-47551eb6563e', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.mortgage', 'Mortgage', 'expense', 'purple', 'housing', false),
  ('5767075a-5c80-80b5-b3df-fe276a68c853', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.energy', 'Energy', 'expense', 'purple', 'housing', false),
  ('eb750f31-8249-8cee-86c7-424c8e8b12a2', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.water', 'Water', 'expense', 'purple', 'housing', false),
  ('fbdb2ba8-0a0d-8868-9f74-b1faf56a3386', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.charges', 'Building charges', 'expense', 'purple', 'housing', false),
  ('e42c5b62-2633-8e04-aeea-0cbafa8f051a', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.insurance', 'Home insurance', 'expense', 'purple', 'housing', false),
  ('bcb33019-ef9c-8e90-bf42-1fda3323cc93', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.renovation', 'Renovation', 'expense', 'purple', 'housing', false),
  ('5485fec9-647d-8689-a565-0ff89d2c6965', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.furniture', 'Furniture & appliances', 'expense', 'purple', 'housing', false),
  ('d63c2487-a3e3-844b-8ae5-7c0e48b08e31', 'e81a2694-7370-8546-85ed-dd5a30ac4edf', 'housing.other', 'Other: Housing', 'expense', 'purple', 'housing', true),
  ('3fba68f1-ed67-8c39-8b32-a5bafe204430', '3c21194d-b07e-896b-9fe0-daecbb918ad2', 'food.groceries', 'Groceries', 'expense', 'orange', 'dining', false),
  ('12974854-2abc-8949-8b5a-5a62bb7c4a92', '3c21194d-b07e-896b-9fe0-daecbb918ad2', 'food.restaurants', 'Restaurants & cafés', 'expense', 'orange', 'dining', false),
  ('c168de93-4733-8d5d-b9ee-990f6ca892df', '3c21194d-b07e-896b-9fe0-daecbb918ad2', 'food.delivery', 'Food delivery', 'expense', 'orange', 'dining', false),
  ('f5e25a05-a723-8948-8ce1-25526edc8885', '3c21194d-b07e-896b-9fe0-daecbb918ad2', 'food.other', 'Other: Food & Groceries', 'expense', 'orange', 'dining', true),
  ('70375563-3b1a-815d-988c-9a281cd047f7', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.fuel', 'Fuel', 'expense', 'blue', 'transport', false),
  ('0b1ff7f7-b1ab-8b12-99ab-58c5f7490f8f', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.transit', 'Public transit', 'expense', 'blue', 'transport', false),
  ('d7193862-22ad-8df4-a9df-d6b871856d46', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.taxi', 'Taxi & rideshare', 'expense', 'blue', 'transport', false),
  ('b0ff67f2-1314-80ef-b9b6-7910ce924688', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.parking', 'Parking & tolls', 'expense', 'blue', 'transport', false),
  ('18942574-5fbb-8ac2-94be-207c335409f3', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.maintenance', 'Vehicle maintenance', 'expense', 'blue', 'transport', false),
  ('51753038-c96a-8315-8c48-1575e8604bfb', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.insurance', 'Vehicle insurance', 'expense', 'blue', 'transport', false),
  ('17a05b5f-1786-85fc-8356-b49155112aa8', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.loan', 'Car loan', 'expense', 'blue', 'transport', false),
  ('cf45b437-885b-8dcc-965d-58e1a173ffda', '5a54d483-0c09-81a4-956c-6e732a090918', 'transport.other', 'Other: Transport', 'expense', 'blue', 'transport', true),
  ('b9836ac1-8fd9-8238-996b-7e03ac6d7729', '5e632f76-8dcc-82e6-9db3-d2f64a72b67e', 'health.doctor', 'Doctor', 'expense', 'green-light', 'health', false),
  ('e738d2de-a5ac-8a07-aeb4-af7f6dcf0816', '5e632f76-8dcc-82e6-9db3-d2f64a72b67e', 'health.pharmacy', 'Pharmacy', 'expense', 'green-light', 'health', false),
  ('97d8bc76-e8f4-8e4b-9d1d-14c67e7c051c', '5e632f76-8dcc-82e6-9db3-d2f64a72b67e', 'health.insurance', 'Health insurance', 'expense', 'green-light', 'health', false),
  ('8a26d2d7-093a-8b0f-8684-1f8d49efb582', '5e632f76-8dcc-82e6-9db3-d2f64a72b67e', 'health.other', 'Other: Health', 'expense', 'green-light', 'health', true),
  ('c54f2f91-7e14-8620-82df-0fe1f8935fa9', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.clothing', 'Clothing', 'expense', 'yellow', 'shopping', false),
  ('f577a9fa-874b-8328-aeb3-f8f539d41942', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.electronics', 'Electronics', 'expense', 'yellow', 'shopping', false),
  ('2151bc5e-66b2-8101-a0c2-5e9bbaaf00d6', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.beauty', 'Personal care', 'expense', 'yellow', 'shopping', false),
  ('967086ff-7ef3-81dc-847e-fb14ebbd4bf3', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.gifts', 'Gifts', 'expense', 'yellow', 'shopping', false),
  ('801e6607-d412-8d53-a562-bb658d37f628', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.pets', 'Pets', 'expense', 'yellow', 'shopping', false),
  ('25d4ba74-8ac9-8834-b1bd-e7d09e3e9753', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.tobacco', 'Tobacco & vaping', 'expense', 'yellow', 'shopping', false),
  ('711c1257-cf24-89b4-b7d9-456ca813b243', '7ecdc8c7-16a2-896f-ab3e-05da0166e9d5', 'shopping.other', 'Other: Shopping & Personal', 'expense', 'yellow', 'shopping', true),
  ('ca4fc72b-0f36-8f96-a364-c79ad28e6b5f', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.streaming', 'Streaming & media', 'expense', 'pink', 'entertainment', false),
  ('fd37782a-0cc9-87b3-bcfd-896954b2810a', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.sport', 'Sports & gym', 'expense', 'pink', 'entertainment', false),
  ('74edd18a-12b6-86ac-a296-d4a0054104e6', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.outings', 'Outings', 'expense', 'pink', 'entertainment', false),
  ('4e33711c-3329-8c22-b429-3412a4c015d5', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.gaming', 'Gaming', 'expense', 'pink', 'entertainment', false),
  ('d8263969-8517-863c-8671-1b811db2706d', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.betting', 'Betting & gambling', 'expense', 'pink', 'entertainment', false),
  ('3792d233-06e8-8e09-bbbf-e78bfbee35a4', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.hobbies', 'Hobbies', 'expense', 'pink', 'entertainment', false),
  ('be46791f-a071-840e-b524-23c4c6cae467', '0a98de4a-2651-86d8-b096-24a90b6c7e90', 'leisure.other', 'Other: Leisure & Outings', 'expense', 'pink', 'entertainment', true),
  ('0ca73605-302e-884d-b68a-7eb9ddca6a7c', '9b2aaef1-8d80-8951-b97a-14856f4ed12a', 'travel.transport', 'Flights & trains', 'expense', 'green-deep', 'travel', false),
  ('546f0b24-ee20-89df-bf0e-c777d229cd1f', '9b2aaef1-8d80-8951-b97a-14856f4ed12a', 'travel.lodging', 'Accommodation', 'expense', 'green-deep', 'travel', false),
  ('98467ce7-51a7-8cf4-b42c-5c1080047ef2', '9b2aaef1-8d80-8951-b97a-14856f4ed12a', 'travel.rental', 'Vehicle rental', 'expense', 'green-deep', 'travel', false),
  ('6696c8aa-4edc-8a11-83be-370a5dfc6d8d', '9b2aaef1-8d80-8951-b97a-14856f4ed12a', 'travel.activities', 'Activities', 'expense', 'green-deep', 'travel', false),
  ('449909b7-9bf2-86f0-ba02-68d366719b88', '9b2aaef1-8d80-8951-b97a-14856f4ed12a', 'travel.other', 'Other: Travel', 'expense', 'green-deep', 'travel', true),
  ('501bc5e2-f93a-807f-9284-267275a7b43c', '8491f1fe-a371-8a43-bc55-b807b4f9cdb1', 'family.school', 'School & tuition', 'expense', 'blue', 'baby', false),
  ('9fdb257e-83eb-8dc3-85b4-2df69ae5171e', '8491f1fe-a371-8a43-bc55-b807b4f9cdb1', 'family.childcare', 'Childcare', 'expense', 'blue', 'baby', false),
  ('af31b71f-4268-8ee4-9ab6-a48e723b49eb', '8491f1fe-a371-8a43-bc55-b807b4f9cdb1', 'family.lessons', 'Lessons & training', 'expense', 'blue', 'baby', false),
  ('c0ed0c58-8481-8fe4-8671-fa2c9be03dd9', '8491f1fe-a371-8a43-bc55-b807b4f9cdb1', 'family.support', 'Child support', 'expense', 'blue', 'baby', false),
  ('fd122aeb-20f4-86f0-85bf-5bd417088f9b', '8491f1fe-a371-8a43-bc55-b807b4f9cdb1', 'family.other', 'Other: Family & Education', 'expense', 'blue', 'baby', true),
  ('df0d3517-de8a-8af9-856e-6b9c8abea2d4', 'e37f0559-bb60-8494-8e45-f698e6696f0f', 'telecom.internet', 'Internet', 'expense', 'purple', 'bolt', false),
  ('0b68130e-caa9-8810-887b-61c6c70a4054', 'e37f0559-bb60-8494-8e45-f698e6696f0f', 'telecom.mobile', 'Mobile plan', 'expense', 'purple', 'bolt', false),
  ('3eaa9921-dff3-8547-aa34-597c5fcc6457', 'e37f0559-bb60-8494-8e45-f698e6696f0f', 'telecom.software', 'Software & online services', 'expense', 'purple', 'bolt', false),
  ('de96d560-5bf8-8107-a7a0-fe57bb64956b', 'e37f0559-bb60-8494-8e45-f698e6696f0f', 'telecom.other', 'Other: Telecom & Software', 'expense', 'purple', 'bolt', true),
  ('9a3c6fa0-1ab5-8710-966a-3dfdc50227db', '50b95c4f-ef3d-86aa-a8ee-c56cbb197b6b', 'taxes.income', 'Income tax', 'expense', 'yellow', 'building', false),
  ('74905de2-4623-8ae1-a627-b4f5422b1f39', '50b95c4f-ef3d-86aa-a8ee-c56cbb197b6b', 'taxes.property', 'Property taxes', 'expense', 'yellow', 'building', false),
  ('eb36e3da-f855-8634-a827-22fec1d276fa', '50b95c4f-ef3d-86aa-a8ee-c56cbb197b6b', 'taxes.social', 'Social contributions', 'expense', 'yellow', 'building', false),
  ('fe7de172-169d-8dae-84bd-64f745ecda3d', '50b95c4f-ef3d-86aa-a8ee-c56cbb197b6b', 'taxes.other', 'Other: Taxes', 'expense', 'yellow', 'building', true),
  ('bd4d5de5-c35a-857d-9463-ceaff1a39838', 'e5844ba0-fecc-87c8-8e0b-636c7cd2dcb9', 'bank.fees', 'Bank fees', 'expense', 'mauve', 'bank', false),
  ('9c523d22-b1e5-818a-87fa-7e2b61ee06f9', 'e5844ba0-fecc-87c8-8e0b-636c7cd2dcb9', 'bank.loan', 'Loan repayment', 'expense', 'mauve', 'bank', false),
  ('d733f803-6ea8-8884-8ec3-d766492fd48b', 'e5844ba0-fecc-87c8-8e0b-636c7cd2dcb9', 'bank.other', 'Other: Bank & Credits', 'expense', 'mauve', 'bank', true),
  ('f370d421-59be-81ca-b73b-2996b635ed20', '0e78c758-95a8-86b5-94f8-62041b66dd51', 'other.donations', 'Donations', 'expense', 'mauve', 'receipt', false),
  ('dcb909d8-385b-8c2f-81fd-f5847b80061f', '0e78c758-95a8-86b5-94f8-62041b66dd51', 'other.professional', 'Professional expenses', 'expense', 'mauve', 'receipt', false),
  ('ed81f564-5d1c-80fe-9b63-64c57eab263a', '0e78c758-95a8-86b5-94f8-62041b66dd51', 'other.misc', 'Miscellaneous', 'expense', 'mauve', 'receipt', true)
ON CONFLICT ("key") WHERE "household_id" IS NULL DO UPDATE SET "name" = EXCLUDED."name", "nature" = EXCLUDED."nature", "color" = EXCLUDED."color", "icon" = EXCLUDED."icon", "is_catch_all" = EXCLUDED."is_catch_all";--> statement-breakpoint
-- Two levels at most, and a household adds subcategories only under a system
-- category: its own tree never nests.
CREATE FUNCTION keel_category_shape() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM categories p
      WHERE p.id = NEW.parent_id AND p.parent_id IS NULL AND p.household_id IS NULL
    ) THEN
      RAISE EXCEPTION 'A subcategory sits under a system category' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.household_id IS NOT NULL AND NEW.parent_id IS NULL THEN
      RAISE EXCEPTION 'A household adds subcategories only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;--> statement-breakpoint
CREATE TRIGGER categories_shape BEFORE INSERT OR UPDATE OF parent_id, household_id ON categories
  FOR EACH ROW EXECUTE FUNCTION keel_category_shape();--> statement-breakpoint
-- A transaction or a mapping points to a leaf, never a category (ADR 0006):
-- the second lock behind the one writer.
CREATE FUNCTION keel_category_is_leaf() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.category_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A category must be a subcategory' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;--> statement-breakpoint
CREATE TRIGGER transactions_category_leaf BEFORE INSERT OR UPDATE OF category_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION keel_category_is_leaf();--> statement-breakpoint
CREATE TRIGGER merchant_mappings_category_leaf BEFORE INSERT OR UPDATE OF category_id ON merchant_mappings
  FOR EACH ROW EXECUTE FUNCTION keel_category_is_leaf();
