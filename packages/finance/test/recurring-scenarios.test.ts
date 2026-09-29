// ramnn's recurring fixtures (packages/jobs/src/utils/recurring-detection
// .test.ts), replayed on keel's model: the same dates and amounts, the
// outcome said in keel's terms (a cadence, a price, a next due day, a
// state and a confidence instead of ramnn's single status).

import { describe, expect, test } from "bun:test";

import { HIGH_CONFIDENCE } from "../src/recurring";
import { detect, monthly, tx } from "./recurring-helpers";

describe("ramnn's scenarios", () => {
  test("nothing from no rows or one row", () => {
    expect(detect([], "2026-06-12")).toEqual([]);
    expect(detect([tx("2026-05-01", -13.49)], "2026-06-12")).toEqual([]);
  });

  test("a clean monthly subscription", () => {
    const [series, ...rest] = detect(
      monthly(
        [
          "2026-01-05",
          "2026-02-05",
          "2026-03-05",
          "2026-04-05",
          "2026-05-05",
          "2026-06-05",
        ],
        -13.49,
      ),
      "2026-06-12",
    );
    expect(rest).toEqual([]);
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.amountKind).toBe("fixed");
    expect(series?.typicalMinor).toBe(1349);
    expect(series?.lastOn).toBe("2026-06-05");
    // A card charges on Sundays too: no shift is learned.
    expect(series?.nextDueOn).toBe("2026-07-05");
    expect(series?.occurrenceCount).toBe(6);
    expect(series?.members).toHaveLength(6);
    expect(series?.state).toBe("live");
    expect(series?.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  test("weekend drift stays monthly", () => {
    const [series] = detect(
      monthly(
        ["2026-01-02", "2026-02-02", "2026-03-04", "2026-04-01", "2026-05-04"],
        -9.99,
      ),
      "2026-05-20",
    );
    expect(series?.schedule.cadence).toBe("monthly");
  });

  test("a price rise keeps one series at the new price", () => {
    const rows = [
      ...monthly(["2026-01-10", "2026-02-10", "2026-03-10"], -13.49),
      ...monthly(["2026-04-10", "2026-05-10", "2026-06-10"], -14.99),
    ];
    const detected = detect(rows, "2026-06-12");
    expect(detected).toHaveLength(1);
    expect(detected[0]?.amountKind).toBe("fixed");
    expect(detected[0]?.typicalMinor).toBe(1499);
  });

  test("two currencies are two series", () => {
    const days = [
      "2026-01-05",
      "2026-02-05",
      "2026-03-05",
      "2026-04-05",
      "2026-05-05",
      "2026-06-05",
    ];
    const detected = detect(
      [...monthly(days, -13.49), ...monthly(days, -9.99, { currency: "USD" })],
      "2026-06-12",
    );
    expect(
      detected.map((series) => [
        series.candidate.currency,
        series.typicalMinor,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["EUR", 1349],
        ["USD", 999],
      ]),
    );
    expect(detected).toHaveLength(2);
  });

  test("EDF, variable, is a series with a range", () => {
    const edf = { sig: { merchantId: "merchant-edf", merchantKey: "edf" } };
    const [series, ...rest] = detect(
      [
        tx("2026-02-03", -100, edf),
        tx("2026-03-03", -80, edf),
        tx("2026-04-03", -120, edf),
        tx("2026-05-03", -95, edf),
      ],
      "2026-05-20",
    );
    expect(rest).toEqual([]);
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.amountKind).toBe("variable");
    expect(series?.lowMinor).toBeLessThan(series?.typicalMinor ?? 0);
    expect(series?.highMinor).toBeGreaterThan(series?.typicalMinor ?? 0);
  });

  test("a missed month does not break the series", () => {
    const [series] = detect(
      monthly(
        ["2026-01-05", "2026-02-05", "2026-04-06", "2026-05-05", "2026-06-05"],
        -13.49,
      ),
      "2026-06-12",
    );
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.occurrenceCount).toBe(5);
    expect(series?.candidate.fit.missed).toBe(1);
  });

  test("two monthly occurrences are a weak suggestion", () => {
    const [series] = detect(
      monthly(["2026-04-15", "2026-05-15"], -7.99),
      "2026-06-01",
    );
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.confidence).toBeLessThan(HIGH_CONFIDENCE);
  });

  test("yearly from two occurrences a year apart", () => {
    const [series] = detect(
      monthly(["2024-03-10", "2025-03-12"], -59),
      "2025-06-01",
    );
    expect(series?.schedule.cadence).toBe("annual");
    expect(series?.nextDueOn).toBe("2026-03-12");
    expect(series?.state).toBe("live");
  });

  test("quarterly with drift", () => {
    const [series] = detect(
      monthly(["2025-07-01", "2025-10-03", "2026-01-05", "2026-04-02"], -150),
      "2026-05-01",
    );
    expect(series?.schedule.cadence).toBe("quarterly");
  });

  test("weekly, and three weeks are enough to suggest", () => {
    const days = ["2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22"];
    expect(detect(monthly(days, -12), "2026-05-25")[0]?.schedule.cadence).toBe(
      "weekly",
    );
    expect(
      detect(monthly(days.slice(0, 3), -12), "2026-05-25")[0]?.schedule.cadence,
    ).toBe("weekly");
  });

  test("biweekly", () => {
    const [series] = detect(
      monthly(
        ["2026-03-06", "2026-03-20", "2026-04-03", "2026-04-17", "2026-05-01"],
        -50,
      ),
      "2026-05-10",
    );
    expect(series?.schedule.cadence).toBe("biweekly");
  });

  test("Basic-Fit every four weeks", () => {
    const gym = {
      sig: { merchantId: "merchant-basicfit", merchantKey: "basic fit" },
    };
    const [series] = detect(
      monthly(
        [
          "2026-01-01",
          "2026-01-29",
          "2026-02-26",
          "2026-03-26",
          "2026-04-23",
          "2026-05-21",
        ],
        -24.99,
        gym,
      ),
      "2026-05-28",
    );
    expect(series?.schedule.cadence).toBe("four_weekly");
    expect(series?.nextDueOn).toBe("2026-06-18");
  });

  test("Basic-Fit's real history: pro-rata, a gap, a new tier", () => {
    const gym = {
      sig: { merchantId: "merchant-basicfit", merchantKey: "basic fit" },
    };
    const detected = detect(
      [
        tx("2026-01-12", -34.99, gym),
        tx("2026-02-02", -6.24, gym),
        tx("2026-03-02", -24.99, gym),
        tx("2026-03-30", -24.99, gym),
        tx("2026-04-24", -29.99, gym),
        tx("2026-05-22", -29.99, gym),
        tx("2026-06-19", -29.99, gym),
      ],
      "2026-06-29",
    );
    expect(detected).toHaveLength(1);
    const [series] = detected;
    expect(series?.schedule.cadence).toBe("four_weekly");
    expect(series?.amountKind).toBe("fixed");
    expect(series?.typicalMinor).toBe(2999);
    // The new billing day wins: four weeks after the 19th of June.
    expect(series?.nextDueOn).toBe("2026-07-17");
  });

  test("a month-end debit across February stays on the last day", () => {
    const [series] = detect(
      monthly(["2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31"], -19.99),
      "2026-04-05",
    );
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.schedule.anchorDay).toBe(31);
    // ramnn predicted the 28th for every month after February.
    expect(series?.nextDueOn).toBe("2026-04-30");
  });

  test("irregular spending is no series", () => {
    expect(
      detect(
        monthly(["2026-01-03", "2026-01-21", "2026-03-02", "2026-05-28"], -40),
        "2026-06-12",
      ),
    ).toEqual([]);
  });

  test("a series that stopped is found ended", () => {
    const [series] = detect(
      monthly(
        ["2024-01-05", "2024-02-05", "2024-03-05", "2024-04-05", "2024-05-05"],
        -13.49,
      ),
      "2024-12-01",
    );
    expect(series?.state).toBe("ended");
    expect(series?.endedReason).toBe("missed");
    expect(series?.nextDueOn).toBeNull();
  });

  test("Amazon: the subscription among one-off purchases", () => {
    const amazon = {
      sig: { merchantId: "merchant-amazon", merchantKey: "amazon" },
    };
    const detected = detect(
      [
        ...monthly(
          ["2026-01-12", "2026-02-12", "2026-03-12", "2026-04-13"],
          -6.99,
          amazon,
        ),
        tx("2026-01-20", -25, amazon),
        tx("2026-02-27", -110, amazon),
        tx("2026-04-02", -60, amazon),
      ],
      "2026-04-20",
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]?.typicalMinor).toBe(699);
    expect(detected[0]?.members).toHaveLength(4);
  });

  test("Disney+ base and premium are two series of one merchant", () => {
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
          ["2026-01-20", "2026-02-20", "2026-03-20", "2026-04-20"],
          -15.99,
          disney,
        ),
      ],
      "2026-04-25",
    );
    expect(
      detected.map((series) => series.typicalMinor).sort((a, b) => a - b),
    ).toEqual([999, 1599]);
    expect(detected.every((series) => series.members.length === 4)).toBe(true);
    expect(
      detected.every((series) => series.schedule.cadence === "monthly"),
    ).toBe(true);
  });

  test("a same-day double debit is one occurrence with two members", () => {
    const [series] = detect(
      [
        ...monthly(["2026-03-05", "2026-04-05", "2026-05-05"], -13.49),
        tx("2026-05-05", -13.49),
      ],
      "2026-05-20",
    );
    expect(series?.occurrenceCount).toBe(3);
    expect(series?.members).toHaveLength(4);
  });

  test("partial enrichment: a merchant and a label key meet", () => {
    const bare = { sig: { merchantId: null } };
    const detected = detect(
      [
        ...monthly(["2026-01-05", "2026-02-05", "2026-03-05"], -13.49),
        ...monthly(["2026-04-06", "2026-05-05", "2026-06-05"], -13.49, bare),
      ],
      "2026-06-12",
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]?.occurrenceCount).toBe(6);
    expect(detected[0]?.signature.merchantId).toBe("merchant-netflix");
  });

  test("no enrichment: the label's key alone, with more evidence", () => {
    const bare = {
      sig: { merchantId: null, merchantKey: "netflix com paris" },
    };
    const [series] = detect(
      monthly(["2026-03-01", "2026-04-01", "2026-05-01"], -29.9, bare),
      "2026-05-10",
    );
    expect(series?.signature.merchantKey).toBe("netflix com paris");
    expect(series?.signature.merchantId).toBeNull();
    // Two months are not enough on a label's words.
    expect(
      detect(monthly(["2026-04-01", "2026-05-01"], -29.9, bare), "2026-05-10"),
    ).toEqual([]);
  });

  test("a SEPA direct debit needs fewer regular gaps than a card", () => {
    const days = ["2026-01-05", "2026-02-05", "2026-03-08", "2026-04-22"];
    expect(
      detect(monthly(days, -19.99, { method: "direct_debit" }), "2026-05-01")[0]
        ?.schedule.cadence,
    ).toBe("monthly");
    expect(detect(monthly(days, -19.99), "2026-05-01")).toEqual([]);
  });

  test("a monthly salary", () => {
    const acme = {
      sig: {
        merchantId: null,
        counterpartyIban: "FR1730003035980005011234567",
        merchantKey: "acme",
      },
      method: "transfer" as const,
    };
    const [series] = detect(
      monthly(
        ["2026-01-28", "2026-02-27", "2026-03-30", "2026-04-28", "2026-05-28"],
        2500,
        acme,
      ),
      "2026-06-05",
    );
    expect(series?.candidate.direction).toBe("inflow");
    expect(series?.schedule.cadence).toBe("monthly");
    expect(series?.typicalMinor).toBe(250_000);
    expect(series?.flow).toBe("income");
  });

  test("income and spending at one merchant are two series", () => {
    const detected = detect(
      [
        ...monthly(["2026-01-05", "2026-02-05", "2026-03-05"], -50),
        ...monthly(["2026-01-20", "2026-02-20", "2026-03-20"], 50),
      ],
      "2026-04-01",
    );
    expect(detected.map((series) => series.candidate.direction).sort()).toEqual(
      ["inflow", "outflow"],
    );
  });
});
