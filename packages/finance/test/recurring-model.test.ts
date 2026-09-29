// The defects the analysis of ramnn found (02-domain.md, section 10), one
// test each, and keel's own rules: attachment, the member's gestures, the
// state in time, the dues and the projection.

import { describe, expect, test } from "bun:test";

import { merchantKey } from "../src/labels";
import {
  advance,
  attach,
  attachTarget,
  counts,
  discover,
  duesOf,
  monthlyEquivalent,
  projectBalance,
  type RecurringRow,
  refit,
  type Series,
} from "../src/recurring";
import { detect, monthly, stored, tx } from "./recurring-helpers";

const MONTHS = [
  "2026-01-05",
  "2026-02-05",
  "2026-03-05",
  "2026-04-07",
  "2026-05-05",
  "2026-06-05",
];

/** A detected series stored as confirmed, with its members attached. */
function confirmed(rows: readonly RecurringRow[], today: string) {
  const [found] = detect(rows, today);
  if (found === undefined) throw new Error("expected a series");
  const series = stored(found, { review: "confirmed" });
  const members = found.members.map((row) => ({ ...row, seriesId: series.id }));
  return { series, members };
}

/** One reconciliation step: attach, then refit and advance each series. */
function step(
  series: Series,
  members: readonly RecurringRow[],
  arrivals: readonly RecurringRow[],
  today: string,
) {
  const joined = attach(arrivals, [attachTarget(series, members)]);
  const added = arrivals
    .filter((row) => joined.get(row.id) === series.id)
    .map((row) => ({ ...row, seriesId: series.id }));
  const all = [...members, ...added];
  const facts = refit(all, {
    cadence: series.schedule.cadence,
    cadencePinned: series.cadencePinned,
    previous: series,
  });
  if (facts === null) throw new Error("members expected");
  const next: Series = {
    ...series,
    ...facts,
    ...advance({ ...series, ...facts }, today),
  };
  return {
    series: next,
    members: all,
    left: arrivals.filter((row) => !joined.has(row.id)),
  };
}

describe("the analysis' defects", () => {
  test("a 37.5% rise is a price change, not a second series", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -8, {
        method: "direct_debit",
        sig: { mandateRef: "RUM-42" },
      }),
      "2026-06-10",
    );
    const after = step(
      series,
      members,
      [
        tx("2026-07-06", -11, {
          method: "direct_debit",
          sig: { mandateRef: "RUM-42" },
        }),
      ],
      "2026-07-10",
    );
    expect(after.left).toEqual([]);
    expect(after.series.typicalMinor).toBe(1100);
    expect(after.series.previousMinor).toBe(800);
    expect(after.series.amountChangedOn).toBe("2026-07-06");
    expect(after.series.amountKind).toBe("fixed");
  });

  test("two plans at close prices are two series", () => {
    const shop = {
      sig: { merchantId: "merchant-cloud", merchantKey: "cloud" },
    };
    const detected = detect(
      [
        ...monthly(
          ["2026-01-03", "2026-02-03", "2026-03-03", "2026-04-03"],
          -9.99,
          shop,
        ),
        ...monthly(
          ["2026-01-18", "2026-02-18", "2026-03-18", "2026-04-18"],
          -10.99,
          shop,
        ),
      ],
      "2026-04-25",
    );
    expect(
      detected.map((series) => series.typicalMinor).sort((a, b) => a - b),
    ).toEqual([999, 1099]);
    expect(
      detected.every((series) => series.schedule.cadence === "monthly"),
    ).toBe(true);
  });

  test("an annual charge does not vanish at its due day", () => {
    const [series] = detect(
      monthly(["2024-10-01", "2025-10-03"], -89),
      "2026-01-01",
    );
    expect(series?.nextDueOn).toBe("2026-10-03");
    const facts = {
      ...(series as NonNullable<typeof series>),
      endedReason: null,
      endedOn: null,
    };
    // Due, not yet arrived: still live within its tolerance, then late, never gone.
    expect(advance(facts, "2026-10-05").state).toBe("live");
    expect(advance(facts, "2026-10-30").state).toBe("late");
    expect(advance(facts, "2026-10-30").nextDueOn).toBe("2026-10-03");
    expect(advance(facts, "2026-11-10").state).toBe("ended");
  });

  test("a salary with a bonus month stays one series and returns to its pay", () => {
    const acme = {
      method: "transfer" as const,
      sig: {
        merchantId: null,
        counterpartyIban: "FR1730003035980005011234567",
        merchantKey: "acme",
      },
    };
    const { series, members } = confirmed(
      monthly(
        ["2026-07-28", "2026-08-28", "2026-09-28", "2026-10-28", "2026-11-27"],
        2500,
        acme,
      ),
      "2026-12-01",
    );
    const december = step(
      series,
      members,
      [tx("2026-12-28", 4000, acme)],
      "2026-12-30",
    );
    expect(december.left).toEqual([]);
    const january = step(
      december.series,
      december.members,
      [tx("2027-01-28", 2500, acme)],
      "2027-01-30",
    );
    expect(january.left).toEqual([]);
    expect(january.series.typicalMinor).toBe(250_000);
    // An income's pay is no price change.
    expect(january.series.previousMinor).toBeNull();
  });

  test("a one-off pro-rata on a subscription is forgotten once the price is back", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -13.49),
      "2026-06-10",
    );
    const odd = step(series, members, [tx("2026-07-05", -6.2)], "2026-07-08");
    expect(odd.series.previousMinor).toBe(1349);
    const back = step(
      odd.series,
      odd.members,
      [tx("2026-08-05", -13.49)],
      "2026-08-08",
    );
    expect(back.series.typicalMinor).toBe(1349);
    expect(back.series.previousMinor).toBeNull();
    expect(back.series.amountChangedOn).toBeNull();
  });

  test("rent paid by standing transfer is a fixed charge", () => {
    const landlord = {
      method: "transfer" as const,
      sig: {
        merchantId: null,
        counterpartyIban: "FR7612345000019876543210987",
        merchantKey: "sci les tilleuls",
      },
    };
    const [series] = detect(monthly(MONTHS, -950, landlord), "2026-06-10");
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.flow).toBe("expense");
    expect(series?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  test("a cancelled series stops projecting at once, until a new charge proves otherwise", () => {
    const { series } = confirmed(monthly(MONTHS, -13.49), "2026-06-10");
    const cancelled = advance(
      { ...series, endedReason: "member", endedOn: "2026-06-10" },
      "2026-06-11",
    );
    expect(cancelled.state).toBe("ended");
    expect(cancelled.nextDueOn).toBeNull();
    expect(
      duesOf({ ...series, ...cancelled }, "2026-06-11", "2026-12-31"),
    ).toEqual([]);
    const charged = advance(
      {
        ...series,
        lastOn: "2026-07-05",
        endedReason: "member",
        endedOn: "2026-06-10",
      },
      "2026-07-06",
    );
    expect(charged.state).toBe("live");
  });

  test("a merchant renamed by the normalizer keeps its series", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -13.49),
      "2026-06-10",
    );
    const renamed = tx("2026-07-05", -13.49, {
      sig: { merchantKey: "netflix" },
    });
    const after = step(series, members, [renamed], "2026-07-08");
    expect(after.left).toEqual([]);
    expect(after.members).toHaveLength(7);
  });

  test("CP Creation's salary, labelled three ways, is one series", () => {
    const key = (label: string) =>
      merchantKey({ labelLines: [label], counterpartyName: null });
    const labels = [
      "VIR SEPA CP CREATION",
      "VIR CP CREATION SAS",
      "CP CREATION",
    ];
    expect(new Set(labels.map(key)).size).toBe(1);
    const rows = MONTHS.map((day, index) =>
      tx(day, 2100, {
        method: "transfer",
        sig: { merchantId: null, merchantKey: key(labels[index % 3] ?? "") },
      }),
    );
    expect(detect(rows, "2026-06-10")).toHaveLength(1);
  });
});

describe("found on the demo data", () => {
  test("an energy bill's winter and summer instalments are one series", () => {
    const edf = {
      method: "direct_debit" as const,
      sig: {
        merchantId: null,
        counterpartyIban: "FR3330002005500000157841Z25",
        merchantKey: "edf",
      },
    };
    const months = Array.from({ length: 24 }, (_, index) => {
      const month = String((index % 12) + 1).padStart(2, "0");
      const year = 2024 + Math.floor(index / 12);
      const winter = index % 12 < 3 || index % 12 > 9;
      return tx(`${year}-${month}-27`, winter ? -118.3 : -74.2, edf);
    });
    const detected = detect(months, "2026-01-05");
    expect(detected).toHaveLength(1);
    expect(detected[0]?.members).toHaveLength(24);
  });

  test("purchases that happen to repeat an amount are no subscription", () => {
    const uber = { sig: { merchantId: "merchant-uber", merchantKey: "uber" } };
    const rides = [
      tx("2026-01-04", -18.4, uber),
      tx("2026-01-19", -20.69, uber),
      tx("2026-02-07", -24.1, uber),
      tx("2026-03-02", -13.9, uber),
      tx("2026-04-19", -20.69, uber),
      tx("2026-04-28", -20.75, uber),
      tx("2026-05-16", -25.05, uber),
      tx("2026-06-11", -16.3, uber),
    ];
    expect(detect(rides, "2026-06-20")).toEqual([]);
  });
});

describe("a late occurrence", () => {
  test("a contract paid a week late joins its month and keeps its day", () => {
    const landlord = {
      method: "transfer" as const,
      sig: {
        merchantId: null,
        counterpartyIban: "FR7612345000019876543210987",
        merchantKey: "sci les tilleuls",
      },
    };
    const { series, members } = confirmed(
      monthly(MONTHS, -950, landlord),
      "2026-06-10",
    );
    const late = step(
      series,
      members,
      [tx("2026-07-13", -950, landlord)],
      "2026-07-14",
    );
    expect(late.left).toEqual([]);
    expect(late.series.state).toBe("live");
    expect(late.series.nextDueOn).toBe("2026-08-05");
  });

  test("a merchant's charge a week off its day is not its subscription's", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -13.49),
      "2026-06-10",
    );
    const off = step(series, members, [tx("2026-07-13", -13.49)], "2026-07-14");
    expect(off.left).toHaveLength(1);
  });
});

describe("attachment", () => {
  const amazon = { sig: { merchantId: null, merchantKey: "amazon" } };

  test("an arrival near its due day joins; one far from it does not", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -13.49),
      "2026-06-10",
    );
    const target = attachTarget(series, members);
    const near = tx("2026-07-08", -13.49);
    const far = tx("2026-07-20", -13.49);
    const joined = attach([near, far], [target]);
    expect(joined.get(near.id)).toBe(series.id);
    expect(joined.has(far.id)).toBe(false);
  });

  test("a purchase at the merchant of a subscription does not join it", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -6.99, amazon),
      "2026-06-10",
    );
    const purchase = tx("2026-07-04", -45, amazon);
    const renewal = tx("2026-07-05", -6.99, amazon);
    const joined = attach([purchase, renewal], [attachTarget(series, members)]);
    expect(joined.has(purchase.id)).toBe(false);
    expect(joined.get(renewal.id)).toBe(series.id);
  });

  test("two plans of one merchant: the closest price wins", () => {
    const disney = {
      sig: { merchantId: "merchant-disney", merchantKey: "disney plus" },
    };
    const detected = detect(
      [
        ...monthly(
          ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08"],
          -9.99,
          disney,
        ),
        ...monthly(
          ["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10"],
          -15.99,
          disney,
        ),
      ],
      "2026-04-25",
    );
    const targets = detected.map((found) =>
      attachTarget(stored(found), found.members),
    );
    const premium = tx("2026-05-09", -15.99, disney);
    const joined = attach([premium], targets);
    const expected = detected.find((found) => found.typicalMinor === 1599);
    expect(joined.get(premium.id)).toBe(
      stored(expected as NonNullable<typeof expected>).id,
    );
  });

  test("a row set aside, another member's or in another currency never joins", () => {
    const { series, members } = confirmed(
      monthly(MONTHS, -13.49),
      "2026-06-10",
    );
    const target = attachTarget(series, members);
    const rows = [
      tx("2026-07-05", -13.49, { excluded: true }),
      tx("2026-07-05", -13.49, { privateTo: "bob" }),
      tx("2026-07-05", -13.49, { currency: "USD" }),
      tx("2026-07-05", 13.49),
    ];
    expect(attach(rows, [target]).size).toBe(0);
  });

  test("a dismissed series takes nothing and is never suggested again", () => {
    const rows = monthly(MONTHS, -13.49);
    const [found] = detect(rows, "2026-06-10");
    const dismissed = stored(found as NonNullable<typeof found>, {
      review: "dismissed",
    });
    expect(
      attach([tx("2026-07-05", -13.49)], [attachTarget(dismissed, [])]).size,
    ).toBe(0);
    const known = [{ series: dismissed, members: [] }];
    expect(
      discover([...rows, tx("2026-07-05", -13.49)], known).candidates,
    ).toEqual([]);
    // Another plan of the same merchant is still found.
    const other = monthly(
      ["2026-03-20", "2026-04-20", "2026-05-20", "2026-06-20"],
      -24.99,
    );
    expect(discover([...rows, ...other], known).candidates).toHaveLength(1);
  });
});

describe("dues and projection", () => {
  const base = {
    id: "rent",
    schedule: {
      cadence: "monthly" as const,
      origin: "2026-01-12",
      anchorDay: 12,
      shift: "following" as const,
    },
    lastOn: "2026-06-12",
    state: "live" as const,
    direction: "outflow" as const,
    typicalMinor: 80_000,
    currency: "EUR",
  };

  test("the next dues, a late one kept on its day", () => {
    expect(
      duesOf(base, "2026-06-20", "2026-08-31").map((due) => due.day),
    ).toEqual([
      "2026-07-13", // the 12th is a Sunday
      "2026-08-12",
    ]);
    const late = duesOf({ ...base, state: "late" }, "2026-07-20", "2026-08-31");
    expect(late.map((due) => [due.day, due.late])).toEqual([
      ["2026-07-13", true],
      ["2026-08-12", false],
    ]);
  });

  test("the balance moves on each due day; today's and late ones land tomorrow", () => {
    const dues = [
      {
        seriesId: "rent",
        day: "2026-06-12",
        amountMinor: -80_000,
        currency: "EUR",
        late: false,
      },
      {
        seriesId: "salary",
        day: "2026-06-12",
        amountMinor: 200_000,
        currency: "EUR",
        late: false,
      },
      {
        seriesId: "gym",
        day: "2026-06-10",
        amountMinor: -3000,
        currency: "EUR",
        late: false,
      },
    ];
    const days = projectBalance(100_000, dues, "2026-06-10", 3);
    expect(days.map((day) => day.balanceMinor)).toEqual([
      100_000, 97_000, 217_000, 217_000,
    ]);
    expect(days[2]?.dues.map((due) => due.seriesId)).toEqual([
      "rent",
      "salary",
    ]);
  });

  test("a weak suggestion enters no figure", () => {
    expect(
      counts({ review: "suggested", state: "live", confidence: 0.6 }),
    ).toBe(false);
    expect(
      counts({ review: "suggested", state: "live", confidence: 0.9 }),
    ).toBe(true);
    expect(
      counts({ review: "confirmed", state: "late", confidence: 0.2 }),
    ).toBe(true);
    expect(counts({ review: "confirmed", state: "ended", confidence: 1 })).toBe(
      false,
    );
    expect(counts({ review: "dismissed", state: "live", confidence: 1 })).toBe(
      false,
    );
  });

  test("a cycle's monthly weight", () => {
    expect(monthlyEquivalent("weekly", 1200)).toBe(5200);
    expect(monthlyEquivalent("annual", 12_000)).toBe(1000);
    expect(monthlyEquivalent("four_weekly", 2999)).toBe(3249);
  });
});
