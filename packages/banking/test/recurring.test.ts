import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNotNull } from "drizzle-orm";

import { refreshInstitutions, searchInstitutions } from "../src/institutions";
import { advanceDay, reconcileHousehold } from "../src/reconcile";
import {
  attachToSeries,
  confirmSeries,
  createSeriesFrom,
  dismissSeries,
  endSeries,
  excludeFromSeries,
  restoreSeries,
  resumeSeries,
  setSeriesCadence,
} from "../src/recurring";
import {
  recurringCalendar,
  recurringList,
  recurringOutlook,
  seriesMembers,
} from "../src/recurring-read";
import { settleArrivals } from "../src/settle-arrivals";
import { createHarness, type Harness, seedHousehold } from "./harness";
import type { ArrivingRow } from "@keel/bank-providers";
import {
  bankAccounts,
  bankConnections,
  recurringSeries,
  type Scope,
  transactions,
} from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000f6";

let h: Harness;
let alice: Scope;
let bob: Scope;
const ids = { current: "", bobCurrent: "" };

function arriving(overrides: Partial<ArrivingRow>): ArrivingRow {
  return {
    part: 0,
    providerRef: null,
    bookedOn: "2026-09-10",
    valueOn: null,
    transactionOn: null,
    amountMinor: -1_000,
    currency: "EUR",
    labelLines: ["PRLV SEPA"],
    counterpartyName: null,
    counterpartyIban: null,
    mandateRef: null,
    mcc: null,
    bankCode: null,
    balanceAfterMinor: null,
    raw: {},
    ...overrides,
  };
}

async function settle(
  scope: Scope,
  accountId: string,
  rows: readonly Partial<ArrivingRow>[],
): Promise<void> {
  await settleArrivals(h.deps, scope, {
    accountId,
    origin: "provider",
    rows: rows.map(arriving),
  });
}

const FREE = (day: string, amountMinor = -1999): Partial<ArrivingRow> => ({
  providerRef: `FREE-${day}`,
  bookedOn: day,
  amountMinor,
  labelLines: ["PRLV SEPA FREE MOBILE", "RUM FMM0042"],
  counterpartyName: "FREE MOBILE",
  counterpartyIban: "FR8310107001180001234567890",
  bankCode: { code: "RDDT", subCode: "ESDD", description: null },
});

async function seriesRows(where?: ReturnType<typeof eq>) {
  return h.testDb.db
    .select()
    .from(recurringSeries)
    .where(
      where === undefined
        ? eq(recurringSeries.householdId, HOUSEHOLD)
        : and(eq(recurringSeries.householdId, HOUSEHOLD), where),
    );
}

async function seriesNamed(merchantKey: string) {
  const [row] = await seriesRows(eq(recurringSeries.merchantKey, merchantKey));
  if (row === undefined) throw new Error(`No series ${merchantKey}`);
  return row;
}

async function membersOf(seriesId: string) {
  return h.testDb.db
    .select()
    .from(transactions)
    .where(eq(transactions.recurringSeriesId, seriesId));
}

async function rowByRef(providerRef: string) {
  const [row] = await h.testDb.db
    .select()
    .from(transactions)
    .where(eq(transactions.providerRef, providerRef));
  if (row === undefined) throw new Error(`No row ${providerRef}`);
  return row;
}

function recurringEvents() {
  return h.recorder
    .events()
    .filter((event) => event.name === "recurring.changed");
}

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, [
    "alice",
    "bob",
  ])) as [Scope, Scope];
  await refreshInstitutions(h.deps);
  const [institution] = await searchInstitutions(h.deps, {
    country: "FR",
    query: "Banque Démo",
  });
  if (institution === undefined) throw new Error("setup");
  const [connection] = await h.testDb.db
    .insert(bankConnections)
    .values({
      householdId: HOUSEHOLD,
      consentedBy: "alice",
      institutionId: institution.id,
      provider: "fake",
      providerSessionRef: "fake-session:recurring",
      consentExpiresAt: new Date("2026-12-28T10:00:00Z"),
    })
    .returning();
  if (connection === undefined) throw new Error("setup");
  const account = async (input: {
    readonly name: string;
    readonly owner?: string;
    readonly isPrivate?: boolean;
    readonly balanceMinor: number;
  }) => {
    const [row] = await h.testDb.db
      .insert(bankAccounts)
      .values({
        householdId: HOUSEHOLD,
        connectionId: connection.id,
        ownerId: input.owner ?? null,
        isPrivate: input.isPrivate ?? false,
        providerAccountRef: `fake-account:${input.name}`,
        stableRef: `fake:${input.name}`,
        providerName: input.name,
        kind: "current",
        kindSetBy: "provider",
        currency: "EUR",
        iban: null,
        balanceMinor: input.balanceMinor,
        balanceAsOf: "2026-09-28",
      })
      .returning();
    if (row === undefined) throw new Error("setup");
    return row.id;
  };
  ids.current = await account({ name: "COMPTE JOINT", balanceMinor: 150_000 });
  ids.bobCurrent = await account({
    name: "COMPTE BOB",
    owner: "bob",
    isPrivate: true,
    balanceMinor: 40_000,
  });
});

describe("the reconciliation finds and keeps series", () => {
  test("a monthly direct debit becomes a suggestion holding its debits", async () => {
    await settle(alice, ids.current, [
      FREE("2026-04-06"),
      FREE("2026-05-05"),
      FREE("2026-06-05"),
      FREE("2026-07-06"),
      FREE("2026-08-05"),
      FREE("2026-09-07"),
      {
        providerRef: "ONE-OFF-1",
        bookedOn: "2026-09-12",
        amountMinor: -4_590,
        labelLines: ["PAIEMENT PSC 1209 PARIS", "FNAC             CARTE 5699"],
      },
    ]);
    h.recorder.clear();
    await reconcileHousehold(h.deps, HOUSEHOLD);

    const series = await seriesNamed("free mobile");
    expect(series.review).toBe("suggested");
    expect(series.origin).toBe("detected");
    expect(series.cadence).toBe("monthly");
    expect(series.mandateRef).toBe("FMM0042");
    expect(series.typicalAmountMinor).toBe(1999);
    expect(series.flow).toBe("unclassified");
    expect(series.name).toBe("Free Mobile");
    // The 5th of October 2026 is a Monday.
    expect(series.nextDueOn).toBe("2026-10-05");
    expect(series.state).toBe("live");
    expect(await membersOf(series.id)).toHaveLength(6);
    expect((await rowByRef("ONE-OFF-1")).recurringSeriesId).toBeNull();
    expect(recurringEvents().at(-1)?.payload).toEqual({
      seriesIds: [series.id],
    });
  });

  test("a second pass writes nothing", async () => {
    const before = await seriesNamed("free mobile");
    h.recorder.clear();
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const after = await seriesNamed("free mobile");
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(recurringEvents()).toEqual([]);
  });

  test("an arrival joins at once, and a new price is a price change", async () => {
    h.clock.advanceDays(8);
    await settle(alice, ids.current, [FREE("2026-10-05", -2499)]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const series = await seriesNamed("free mobile");
    expect(await membersOf(series.id)).toHaveLength(7);
    expect(series.typicalAmountMinor).toBe(2499);
    expect(series.previousAmountMinor).toBe(1999);
    expect(series.amountChangedOn).toBe("2026-10-05");
    expect(series.nextDueOn).toBe("2026-11-05");
  });

  test("the calendar makes a series late, then ends it", async () => {
    h.clock.advanceDays(30); // 2026-11-05: due today
    await advanceDay(h.deps);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect((await seriesNamed("free mobile")).state).toBe("live");
    h.clock.advanceDays(7); // 2026-11-12: past its tolerance
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const late = await seriesNamed("free mobile");
    expect(late.state).toBe("late");
    expect(late.nextDueOn).toBe("2026-11-05");
    await settle(alice, ids.current, [FREE("2026-11-12", -2499)]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const back = await seriesNamed("free mobile");
    expect(back.state).toBe("live");
    expect(back.nextDueOn).toBe("2026-12-07");
  });
});

describe("the member's gestures", () => {
  test("confirm, dismiss and undo", async () => {
    const { id } = await seriesNamed("free mobile");
    await confirmSeries(h.deps, alice, { id });
    expect((await seriesNamed("free mobile")).review).toBe("confirmed");

    await dismissSeries(h.deps, alice, { id });
    const dismissed = await seriesNamed("free mobile");
    expect(dismissed.review).toBe("dismissed");
    expect(await membersOf(id)).toHaveLength(0);
    // Its counterparty is never suggested again.
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(
      await seriesRows(eq(recurringSeries.merchantKey, "free mobile")),
    ).toHaveLength(1);
    expect(await membersOf(id)).toHaveLength(0);

    await restoreSeries(h.deps, alice, { id });
    const restored = await seriesNamed("free mobile");
    expect(restored.review).toBe("suggested");
    expect(await membersOf(id)).toHaveLength(8);
  });

  test("a transaction set aside leaves alone and never comes back", async () => {
    const { id } = await seriesNamed("free mobile");
    const row = await rowByRef("FREE-2026-05-05");
    await excludeFromSeries(h.deps, alice, { transactionId: row.id });
    const excluded = await rowByRef("FREE-2026-05-05");
    expect(excluded.recurringSeriesId).toBeNull();
    expect(excluded.recurringExcluded).toBe(true);
    expect((await seriesNamed("free mobile")).review).toBe("suggested");
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect((await rowByRef("FREE-2026-05-05")).recurringSeriesId).toBeNull();

    // Attached back by hand: a confirmation.
    await attachToSeries(h.deps, alice, {
      transactionId: row.id,
      seriesId: id,
    });
    expect((await rowByRef("FREE-2026-05-05")).recurringSeriesId).toBe(id);
    expect((await seriesNamed("free mobile")).review).toBe("confirmed");
  });

  test("a series from one transaction takes its earlier occurrences", async () => {
    const rent = (day: string): Partial<ArrivingRow> => ({
      providerRef: `RENT-${day}`,
      bookedOn: day,
      amountMinor: -95_000,
      labelLines: ["VIR LOYER APPARTEMENT"],
    });
    await settle(alice, ids.current, [rent("2026-10-01"), rent("2026-11-02")]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    // Two months on a label's words alone are not enough to suggest it.
    expect(
      await seriesRows(eq(recurringSeries.merchantKey, "loyer appartement")),
    ).toHaveLength(0);

    const latest = await rowByRef("RENT-2026-11-02");
    const { id } = await createSeriesFrom(h.deps, alice, {
      transactionId: latest.id,
      cadence: "monthly",
    });
    const series = await seriesNamed("loyer appartement");
    expect(series.id).toBe(id);
    expect(series.origin).toBe("member");
    expect(series.review).toBe("confirmed");
    expect(series.cadencePinned).toBe(true);
    expect(await membersOf(id)).toHaveLength(2);
    expect(series.nextDueOn).not.toBeNull();

    await setSeriesCadence(h.deps, alice, { id, cadence: "quarterly" });
    expect((await seriesNamed("loyer appartement")).cadence).toBe("quarterly");
  });

  test("cancelled: no due any more, until the member says otherwise", async () => {
    const { id } = await seriesNamed("free mobile");
    await endSeries(h.deps, alice, { id });
    const ended = await seriesNamed("free mobile");
    expect(ended.state).toBe("ended");
    expect(ended.endedReason).toBe("member");
    expect(ended.nextDueOn).toBeNull();
    const outlook = await recurringOutlook(h.deps, alice);
    expect(outlook.dues.some((due) => due.seriesId === id)).toBe(false);

    await resumeSeries(h.deps, alice, { id });
    const resumed = await seriesNamed("free mobile");
    expect(resumed.endedReason).toBeNull();
    expect(resumed.state).not.toBe("ended");
  });
});

describe("privacy", () => {
  test("a private account's series is its owner's alone", async () => {
    const gym = (day: string): Partial<ArrivingRow> => ({
      providerRef: `GYM-${day}`,
      bookedOn: day,
      amountMinor: -2_999,
      labelLines: ["PRLV SEPA BASIC FIT"],
      counterpartyIban: "FR7630004000031234567890143",
      bankCode: { code: "RDDT", subCode: "ESDD", description: null },
    });
    await settle(bob, ids.bobCurrent, [
      gym("2026-08-24"),
      gym("2026-09-24"),
      gym("2026-10-26"),
      gym("2026-11-24"),
    ]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const series = await seriesNamed("basic fit");
    expect(series.privateTo).toBe("bob");
    const bobs = await recurringList(h.deps, bob);
    const alices = await recurringList(h.deps, alice);
    expect(bobs.series.some((item) => item.id === series.id)).toBe(true);
    expect(alices.series.some((item) => item.id === series.id)).toBe(false);
    expect(
      h.recorder
        .events()
        .filter(
          (event) =>
            event.name === "recurring.changed" &&
            (event.payload as { seriesIds: string[] }).seriesIds.includes(
              series.id,
            ),
        )
        .every((event) => event.meta.privateTo === "bob"),
    ).toBe(true);
  });
});

describe("reads", () => {
  test("the list, the outlook, the calendar and a series' members", async () => {
    const { id } = await seriesNamed("free mobile");
    await confirmSeries(h.deps, alice, { id });

    const list = await recurringList(h.deps, alice);
    const free = list.series.find((item) => item.id === id);
    expect(free?.counts).toBe(true);
    expect(free?.priceChange).toEqual({
      previousMinor: 1999,
      on: "2026-10-05",
    });
    expect(free?.converted?.typicalMinor).toBe(2499);

    const outlook = await recurringOutlook(h.deps, alice);
    expect(outlook.today).toBe("2026-11-12");
    expect(outlook.projection?.startMinor).toBe(150_000);
    const due = outlook.dues.find((item) => item.seriesId === id);
    expect(due).toMatchObject({
      day: "2026-12-07",
      amountMinor: -2499,
      late: false,
    });
    expect(outlook.month.fixedPaidMinor).toBe(0); // unclassified, not yet an expense

    const calendar = await recurringCalendar(h.deps, alice, {
      month: "2026-11-01",
    });
    expect(
      calendar.entries
        .filter((entry) => entry.seriesId === id)
        .map((entry) => [entry.day, entry.status]),
    ).toEqual([
      ["2026-11-12", "paid"],
      ["2026-12-07", "due"],
    ]);

    const members = await seriesMembers(h.deps, alice, { id });
    expect(members[0]?.series?.id).toBe(id);
    expect(members.every((row) => row.series?.cadence === "monthly")).toBe(
      true,
    );
  });

  test("rows keep their series mark in the list", async () => {
    const rows = await h.testDb.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(isNotNull(transactions.recurringSeriesId));
    expect(rows.length).toBeGreaterThan(0);
  });
});
