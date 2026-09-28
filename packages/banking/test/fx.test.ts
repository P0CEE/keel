import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { parseEcbRates, refreshFxRates } from "../src/fx";
import { fxRates } from "@keel/db";
import { createTestDatabase, type TestDatabase } from "@keel/db/testing";

// The shape the ECB publishes (eurofxref-hist-90d.xml), trimmed.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2026-09-25">
      <Cube currency="USD" rate="1.1750"/>
      <Cube currency="JPY" rate="172.50"/>
    </Cube>
    <Cube time="2026-09-24">
      <Cube currency="USD" rate="1.1700"/>
      <Cube currency="JPY" rate="171.9"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbRates", () => {
  test("one row per currency and business day, the decimal kept as written", () => {
    expect(parseEcbRates(XML)).toEqual([
      { currency: "USD", day: "2026-09-25", perEur: "1.1750" },
      { currency: "JPY", day: "2026-09-25", perEur: "172.50" },
      { currency: "USD", day: "2026-09-24", perEur: "1.1700" },
      { currency: "JPY", day: "2026-09-24", perEur: "171.9" },
    ]);
  });

  test("days before `from` are dropped", () => {
    expect(parseEcbRates(XML, "2026-09-25").map((row) => row.day)).toEqual([
      "2026-09-25",
      "2026-09-25",
    ]);
  });
});

describe("refreshFxRates", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  const deps = () => ({
    database: testDb.db,
    now: () => new Date("2026-09-28T15:00:00Z"),
  });

  test("the daily run reads the 90-day file and is idempotent", async () => {
    const asked: string[] = [];
    const fetcher = (url: string) => {
      asked.push(url);
      return Promise.resolve(XML);
    };
    expect(await refreshFxRates(deps(), {}, fetcher)).toEqual({ stored: 4 });
    expect(await refreshFxRates(deps(), {}, fetcher)).toEqual({ stored: 4 });
    expect(asked.every((url) => url.endsWith("eurofxref-hist-90d.xml"))).toBe(
      true,
    );
    expect(await testDb.db.select().from(fxRates)).toHaveLength(4);
  });

  test("a backfill past 90 days reads the full history", async () => {
    const asked: string[] = [];
    await refreshFxRates(deps(), { from: "2024-01-01" }, (url) => {
      asked.push(url);
      return Promise.resolve(XML);
    });
    expect(asked).toEqual([
      "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml",
    ]);
  });

  test("a file without rates fails the job rather than succeed empty", async () => {
    const error = await refreshFxRates(deps(), {}, () =>
      Promise.resolve("<Cube/>"),
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("No ECB rate");
  });
});
