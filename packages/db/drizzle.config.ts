import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL from the package's .env (Bun auto-loads it).
// `generate` only needs the schema; `migrate`/`push` connect to the database.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
