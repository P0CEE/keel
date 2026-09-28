import { describe, expect, test } from "bun:test";

import {
  type Arrival,
  fingerprint,
  settle,
  type Stored,
} from "../src/settlement";

function arrival(
  overrides: Partial<Arrival> & { label?: string } = {},
): Arrival {
  const base = {
    bookedOn: "2026-09-25",
    purchasedOn: "2026-09-24",
    amountMinor: -4215,
    currency: "EUR",
    label: "PAIEMENT CB 2409 PARIS MONOPRIX",
    counterpartyName: null,
    counterpartyIban: null,
    mcc: null,
    providerRef: null,
    part: 0,
    ...overrides,
  };
  return {
    ...base,
    fingerprint:
      overrides.fingerprint ??
      fingerprint({
        bookedOn: base.bookedOn,
        amountMinor: base.amountMinor,
        currency: base.currency,
        identityLabel: base.label.toUpperCase(),
      }),
  };
}

function stored(
  row: Arrival,
  overrides: Partial<Stored> & { occurrence?: number | null } = {},
): Stored {
  return {
    id: overrides.id ?? "stored-1",
    origin: "provider",
    deleted: false,
    occurrence: 0,
    ...row,
    ...overrides,
  };
}

describe("identity", () => {
  test("a replayed fetch settles to nothing", () => {
    const rows = [
      arrival({ providerRef: "R1" }),
      arrival({ label: "PRLV SEPA EDF", amountMinor: -7420 }),
    ];
    const known = rows.map((row, index) => stored(row, { id: `s${index}` }));
    expect(settle(rows, known, "provider")).toEqual([
      { kind: "skip", reason: "known" },
      { kind: "skip", reason: "known" },
    ]);
  });

  test("two identical purchases the same day without entry_reference are two transactions", () => {
    const coffee = arrival({
      label: "PAIEMENT CB 2409 CAFE",
      amountMinor: -250,
    });
    expect(settle([coffee, coffee], [], "provider")).toEqual([
      { kind: "insert", providerRef: null, occurrence: 0 },
      { kind: "insert", providerRef: null, occurrence: 1 },
    ]);
  });

  test("the second identical purchase arriving a sync later is new", () => {
    const coffee = arrival({
      label: "PAIEMENT CB 2409 CAFE",
      amountMinor: -250,
    });
    expect(settle([coffee, coffee], [stored(coffee)], "provider")).toEqual([
      { kind: "skip", reason: "known" },
      { kind: "insert", providerRef: null, occurrence: 1 },
    ]);
  });

  test("a revised amount on a referenced row promotes it", () => {
    const before = arrival({ providerRef: "R1" });
    const after = arrival({ providerRef: "R1", amountMinor: -4300 });
    expect(settle([after], [stored(before)], "provider")).toEqual([
      {
        kind: "promote",
        storedId: "stored-1",
        providerRef: "R1",
        occurrence: 0,
      },
    ]);
  });

  test("a reference the bank adds later is adopted", () => {
    const before = arrival();
    const after = arrival({ providerRef: "R9" });
    expect(settle([after], [stored(before)], "provider")).toEqual([
      {
        kind: "promote",
        storedId: "stored-1",
        providerRef: "R9",
        occurrence: 0,
      },
    ]);
  });

  test("a reference the bank stops sending is kept", () => {
    const before = arrival({ providerRef: "R9" });
    const after = arrival();
    expect(settle([after], [stored(before)], "provider")).toEqual([
      { kind: "skip", reason: "known" },
    ]);
  });
});

describe("tombstones", () => {
  test("a deleted row is never resurrected, by reference", () => {
    const row = arrival({ providerRef: "R1", amountMinor: -9999 });
    expect(
      settle(
        [row],
        [stored(arrival({ providerRef: "R1" }), { deleted: true })],
        "provider",
      ),
    ).toEqual([{ kind: "skip", reason: "tombstone" }]);
  });

  test("a deleted row is never resurrected, by fingerprint", () => {
    const row = arrival();
    expect(settle([row], [stored(row, { deleted: true })], "provider")).toEqual(
      [{ kind: "skip", reason: "tombstone" }],
    );
  });
});

describe("a full fetch's overlapping halves", () => {
  test("a stale copy never promotes over the fresh row (ramnn's batches of 500)", () => {
    const fresh = arrival({ providerRef: "R1", amountMinor: -4300, part: 0 });
    const stale = arrival({ providerRef: "R1", amountMinor: -4215, part: 1 });
    const filler = Array.from({ length: 600 }, (_, index) =>
      arrival({ providerRef: `F${index}`, part: 0 }),
    );
    const verdicts = settle(
      [fresh, ...filler, stale],
      [stored(arrival({ providerRef: "R1", amountMinor: -4215 }))],
      "provider",
    );
    expect(verdicts[0]).toEqual({
      kind: "promote",
      storedId: "stored-1",
      providerRef: "R1",
      occurrence: 0,
    });
    expect(verdicts.at(-1)).toEqual({ kind: "skip", reason: "repeated" });
  });

  test("an unreferenced row both halves return is one row", () => {
    const live = arrival({ part: 0 });
    const history = arrival({ part: 1 });
    expect(settle([live, history], [], "provider")).toEqual([
      { kind: "insert", providerRef: null, occurrence: 0 },
      { kind: "skip", reason: "repeated" },
    ]);
  });

  test("two identical purchases both halves return are still two", () => {
    const row = arrival({ label: "PAIEMENT CB 2409 CAFE", amountMinor: -250 });
    const verdicts = settle(
      [
        { ...row, part: 0 },
        { ...row, part: 0 },
        { ...row, part: 1 },
        { ...row, part: 1 },
      ],
      [],
      "provider",
    );
    expect(verdicts.map((verdict) => verdict.kind)).toEqual([
      "insert",
      "insert",
      "skip",
      "skip",
    ]);
  });
});

describe("revision of an unreferenced row", () => {
  test("a reworded label is the same row, not a new one", () => {
    const before = arrival({ label: "PAIEMENT CB 2409 MONOPRIX" });
    const after = arrival({ label: "PAIEMENT CB 2409 MONOPRIX PARIS 11" });
    expect(settle([after], [stored(before)], "provider")).toEqual([
      {
        kind: "promote",
        storedId: "stored-1",
        providerRef: null,
        occurrence: 0,
      },
    ]);
  });

  test("ambiguous evidence inserts rather than guess", () => {
    const one = arrival({ label: "PAIEMENT CB 2409 A" });
    const two = arrival({ label: "PAIEMENT CB 2409 B" });
    const verdicts = settle(
      [
        arrival({ label: "PAIEMENT CB 2409 C" }),
        arrival({ label: "PAIEMENT CB 2409 D" }),
      ],
      [stored(one, { id: "s1" }), stored(two, { id: "s2" })],
      "provider",
    );
    expect(verdicts.map((verdict) => verdict.kind)).toEqual([
      "insert",
      "insert",
    ]);
  });
});

describe("rows of another origin", () => {
  const placeholder = stored(
    arrival({
      label: "Courses",
      bookedOn: "2026-09-23",
      purchasedOn: "2026-09-23",
    }),
    { id: "manual-1", origin: "manual", fingerprint: null, occurrence: null },
  );

  test("the bank's row promotes a member's placeholder", () => {
    expect(
      settle([arrival({ providerRef: "R1" })], [placeholder], "provider"),
    ).toEqual([
      {
        kind: "promote",
        storedId: "manual-1",
        providerRef: "R1",
        occurrence: 0,
      },
    ]);
  });

  test("too far apart, they are two purchases", () => {
    expect(
      settle(
        [arrival({ purchasedOn: "2026-09-30", bookedOn: "2026-09-30" })],
        [placeholder],
        "provider",
      ).map((verdict) => verdict.kind),
    ).toEqual(["insert"]);
  });

  test("different counterparty accounts are different payments", () => {
    const transfer = stored(
      arrival({ counterpartyIban: "FR7600000000000000000000001" }),
      { id: "manual-2", origin: "manual", fingerprint: null, occurrence: null },
    );
    expect(
      settle(
        [arrival({ counterpartyIban: "FR7600000000000000000000002" })],
        [transfer],
        "provider",
      ).map((verdict) => verdict.kind),
    ).toEqual(["insert"]);
  });

  test("one placeholder answers one bank row", () => {
    const verdicts = settle(
      [arrival({ providerRef: "R1" }), arrival({ providerRef: "R2" })],
      [placeholder],
      "provider",
    );
    expect(verdicts.map((verdict) => verdict.kind)).toEqual([
      "promote",
      "insert",
    ]);
  });

  test("a CSV line never rewrites a synced row", () => {
    const synced = stored(arrival({ providerRef: "R1", label: "CB MONOPRIX" }));
    expect(
      settle([arrival({ label: "Carte X1234 Monoprix" })], [synced], "csv"),
    ).toEqual([{ kind: "skip", reason: "known" }]);
  });
});

describe("occurrence slots", () => {
  test("a write never lands on a slot another row holds", () => {
    const row = arrival({ providerRef: "R2" });
    const holder = stored(arrival({ providerRef: "R1" }), { id: "holder" });
    expect(settle([row], [holder], "provider")).toEqual([
      { kind: "insert", providerRef: "R2", occurrence: 1 },
    ]);
  });
});
