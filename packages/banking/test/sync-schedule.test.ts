import { describe, expect, test } from "bun:test";

import {
  jitterMinutes,
  nextSyncAt,
  SYNC_JITTER_MINUTES,
} from "../src/sync-schedule";

const ID = "0192f0a0-0000-7000-8000-000000000001";
const jitter = jitterMinutes(ID) * 60_000;

function at(iso: string): Date {
  return new Date(new Date(iso).getTime() + jitter);
}

describe("nextSyncAt", () => {
  test("the evening slot after noon, in the household's zone", () => {
    // Noon in Paris (UTC+2 in summer): next is 19:00 local, 17:00 UTC.
    expect(
      nextSyncAt(new Date("2026-09-28T10:00:00Z"), "Europe/Paris", ID),
    ).toEqual(at("2026-09-28T17:00:00Z"));
  });

  test("the next morning's slot after the evening one", () => {
    expect(
      nextSyncAt(new Date("2026-09-28T20:00:00Z"), "Europe/Paris", ID),
    ).toEqual(at("2026-09-29T05:00:00Z"));
  });

  test("follows the offset across a daylight saving change", () => {
    // Paris leaves summer time on 25 October 2026: 7:00 is then 06:00 UTC.
    expect(
      nextSyncAt(new Date("2026-10-24T20:00:00Z"), "Europe/Paris", ID),
    ).toEqual(at("2026-10-25T06:00:00Z"));
  });

  test("another zone keeps its own clock", () => {
    expect(
      nextSyncAt(new Date("2026-09-28T10:00:00Z"), "America/Toronto", ID),
    ).toEqual(at("2026-09-28T11:00:00Z"));
  });

  test("a connection keeps its place in the slot", () => {
    expect(jitterMinutes(ID)).toBe(jitterMinutes(ID));
    expect(jitterMinutes(ID)).toBeLessThan(SYNC_JITTER_MINUTES);
  });
});
