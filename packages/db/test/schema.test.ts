import { expect, test } from "bun:test";
import { getTableName } from "drizzle-orm";

import { account, session, user, verification } from "../src/schema/auth";

// Better Auth resolves its tables by these exact (singular) names. Renaming a
// table here would silently break the Drizzle adapter, so guard the names.
test("Better Auth tables keep their expected names", () => {
  expect(getTableName(user)).toBe("user");
  expect(getTableName(session)).toBe("session");
  expect(getTableName(account)).toBe("account");
  expect(getTableName(verification)).toBe("verification");
});
