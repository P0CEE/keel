import { and, eq, sql } from "drizzle-orm";

import { db } from "../client";
import { householdMembers, households, memberSettings } from "../schema";
import {
  type Database,
  type Scope,
  type Transaction,
  withScope,
} from "../scope";

export type Locale = (typeof memberSettings.$inferSelect)["locale"];

export type NewMember = {
  readonly memberId: string;
  readonly householdName: string;
  readonly baseCurrency: string;
  readonly timezone: string;
  readonly locale: Locale;
};

/**
 * Give a member their household of one: the household, the membership (as
 * owner) and their settings, together. Idempotent: a member who already has
 * a household gets it back, so sign-up and the first scoped request can both
 * call it, and a failed sign-up hook heals on the next request. Concurrent
 * calls for one member are serialized by a transaction-level advisory lock.
 */
export function provisionMember(
  member: NewMember,
  database: Database = db,
): Promise<Scope> {
  const fresh: Scope = {
    householdId: crypto.randomUUID(),
    memberId: member.memberId,
  };
  return withScope(
    fresh,
    async ({ tx }) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`member:${member.memberId}`}, 0))`,
      );
      const [existing] = await tx
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(eq(householdMembers.userId, member.memberId))
        .limit(1);
      if (existing) {
        return { householdId: existing.householdId, memberId: member.memberId };
      }
      await tx.insert(households).values({
        id: fresh.householdId,
        name: member.householdName,
        baseCurrency: member.baseCurrency,
        timezone: member.timezone,
      });
      await tx.insert(householdMembers).values({
        householdId: fresh.householdId,
        userId: member.memberId,
        role: "owner",
      });
      await tx.insert(memberSettings).values({
        userId: member.memberId,
        householdId: fresh.householdId,
        locale: member.locale,
      });
      return fresh;
    },
    database,
  );
}

export type HouseholdView = {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
  readonly timezone: string;
  readonly role: "owner" | "member";
};

/** The scope's household, with the member's role in it. */
export async function getHousehold(
  tx: Transaction,
  scope: Scope,
): Promise<HouseholdView> {
  const [row] = await tx
    .select({
      id: households.id,
      name: households.name,
      baseCurrency: households.baseCurrency,
      timezone: households.timezone,
      role: householdMembers.role,
    })
    .from(households)
    .innerJoin(
      householdMembers,
      and(
        eq(householdMembers.householdId, households.id),
        eq(householdMembers.userId, scope.memberId),
      ),
    )
    .where(eq(households.id, scope.householdId))
    .limit(1);
  if (!row) {
    throw new Error(`Household ${scope.householdId} is not visible`);
  }
  return row;
}

export type HouseholdPatch = {
  readonly name?: string;
  readonly baseCurrency?: string;
  readonly timezone?: string;
};

export async function updateHousehold(
  tx: Transaction,
  scope: Scope,
  patch: HouseholdPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) {
    return;
  }
  await tx
    .update(households)
    .set(patch)
    .where(eq(households.id, scope.householdId));
}

export type SettingsView = {
  readonly locale: Locale;
  readonly displayCurrency: string | null;
  /** As stored: the reader checks it against the widget registry. */
  readonly homeLayout: unknown;
  readonly onboardedAt: Date | null;
};

export async function getSettings(
  tx: Transaction,
  scope: Scope,
): Promise<SettingsView> {
  const [row] = await tx
    .select({
      locale: memberSettings.locale,
      displayCurrency: memberSettings.displayCurrency,
      homeLayout: memberSettings.homeLayout,
      onboardedAt: memberSettings.onboardedAt,
    })
    .from(memberSettings)
    .where(
      and(
        eq(memberSettings.userId, scope.memberId),
        eq(memberSettings.householdId, scope.householdId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error(`Settings of ${scope.memberId} are not visible`);
  }
  return row;
}

export type SettingsPatch = {
  readonly locale?: Locale;
  readonly displayCurrency?: string | null;
  /** Null goes back to the adaptive default. */
  readonly homeLayout?: { readonly widgets: readonly string[] } | null;
};

export async function updateSettings(
  tx: Transaction,
  scope: Scope,
  patch: SettingsPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) {
    return;
  }
  await tx
    .update(memberSettings)
    .set(patch)
    .where(
      and(
        eq(memberSettings.userId, scope.memberId),
        eq(memberSettings.householdId, scope.householdId),
      ),
    );
}
