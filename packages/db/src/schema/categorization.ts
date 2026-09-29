import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../uuid";
import { user } from "./auth";
import { households } from "./households";
import { currentHousehold, currentMember, keelApp } from "./rls";

export const categoryNature = pgEnum("category_nature", [
  "income",
  "expense",
  "transfer",
]);

export const categorySource = pgEnum("category_source", [
  "user",
  "mapping",
  "history",
  "dictionary",
  "model",
]);

/**
 * The taxonomy (ADR 0012): the system's rows are global (`household_id`
 * null, a stable `key`, their names in `@keel/finance/taxonomy`); a
 * household adds only subcategories under a system category. Two levels:
 * a transaction points to a leaf, never to a category.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "cascade",
    }),
    parentId: uuid("parent_id"),
    key: text("key"),
    // A household's own name; the system's English name, its labels live
    // in @keel/finance/taxonomy under its key.
    name: text("name").notNull(),
    nature: categoryNature("nature").notNull(),
    // A palette role (`--category-*`), inherited by the leaves.
    color: text("color").notNull(),
    // A category glyph name (`@keel/ui/finance/category-glyphs`).
    icon: text("icon").notNull(),
    isCatchAll: boolean("is_catch_all").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "categories_parent_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    uniqueIndex("categories_system_key")
      .on(table.key)
      .where(sql`${table.householdId} IS NULL`),
    uniqueIndex("categories_household_name_key")
      .on(table.householdId, table.parentId, table.name)
      .where(sql`${table.householdId} IS NOT NULL`),
    index("categories_parent_idx").on(table.parentId),
    // Everyone reads the system's rows and their own household's; a
    // household writes only its own.
    pgPolicy("categories_read", {
      to: keelApp,
      for: "select",
      using: sql`${table.householdId} IS NULL OR ${table.householdId} = ${currentHousehold}`,
    }),
    pgPolicy("categories_write", {
      to: keelApp,
      for: "insert",
      withCheck: sql`${table.householdId} = ${currentHousehold}`,
    }),
    pgPolicy("categories_update", {
      to: keelApp,
      for: "update",
      using: sql`${table.householdId} = ${currentHousehold}`,
      withCheck: sql`${table.householdId} = ${currentHousehold}`,
    }),
  ],
);

/**
 * A business shared by every household (name, website): the identity the
 * model or a dictionary gave a merchant key, remembered so no household asks
 * again. Global, no row-level security; a person is never a merchant.
 */
export const merchants = pgTable("merchants", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * A domain's logo, fetched once from the source and served for good by the
 * API (`/logos/<domain>.png`). Null bytes remember a domain without a logo.
 */
export const merchantLogos = pgTable("merchant_logos", {
  domain: text("domain").primaryKey(),
  contentType: text("content_type"),
  bytes: bytea("bytes"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const mappingMatcher = pgEnum("mapping_matcher", [
  "merchant",
  "keyword",
]);

/**
 * A household's rule that a merchant, or a keyword of the label, always goes
 * to one leaf (ADR 0006). At most one per merchant; between two keywords the
 * longest wins.
 */
export const merchantMappings = pgTable(
  "merchant_mappings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    matcher: mappingMatcher("matcher").notNull(),
    pattern: text("pattern").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("merchant_mappings_pattern_key").on(
      table.householdId,
      table.matcher,
      table.pattern,
    ),
    pgPolicy("merchant_mappings_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold}`,
      withCheck: sql`${table.householdId} = ${currentHousehold}`,
    }),
  ],
);

/**
 * A member's correction, with the automatic decision it replaced: the eval
 * grows from real use (04-ai-study.md, section 3.4). Private rows keep their
 * privacy here too.
 */
export const categoryCorrections = pgTable(
  "category_corrections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    privateTo: text("private_to").references(() => user.id, {
      onDelete: "cascade",
    }),
    transactionId: uuid("transaction_id").notNull(),
    fromCategoryId: uuid("from_category_id"),
    fromSource: categorySource("from_source"),
    fromConfidence: real("from_confidence"),
    toCategoryId: uuid("to_category_id").notNull(),
    // What the model saw, kept so the case replays even after an edit.
    label: text("label").notNull(),
    merchantKey: text("merchant_key"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    correctedBy: text("corrected_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("category_corrections_household_idx").on(
      table.householdId,
      table.createdAt,
    ),
    pgPolicy("category_corrections_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold} AND (${table.privateTo} IS NULL OR ${table.privateTo} = ${currentMember})`,
      withCheck: sql`${table.householdId} = ${currentHousehold} AND (${table.privateTo} IS NULL OR ${table.privateTo} = ${currentMember})`,
    }),
  ],
);

/**
 * What a recategorization replaced, for its undo: ids and categories only,
 * restored server-side (ramnn trusted a source sent by the client). Kept a
 * day.
 */
export const categoryUndos = pgTable(
  "category_undos",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    changes: jsonb("changes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    pgPolicy("category_undos_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold} AND ${table.createdBy} = ${currentMember}`,
      withCheck: sql`${table.householdId} = ${currentHousehold} AND ${table.createdBy} = ${currentMember}`,
    }),
  ],
);
