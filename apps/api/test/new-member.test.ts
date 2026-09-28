import { describe, expect, test } from "bun:test";

import {
  localeFrom,
  newMemberDefaults,
  signUpContextSchema,
} from "../src/lib/new-member";

describe("newMemberDefaults", () => {
  test("uses the browser's timezone and language", () => {
    expect(
      newMemberDefaults({
        memberId: "u1",
        name: "Camille Laurent",
        context: { timezone: "America/Montreal", locale: "fr-CA" },
      }),
    ).toEqual({
      memberId: "u1",
      householdName: "Camille Laurent",
      baseCurrency: "EUR",
      timezone: "America/Montreal",
      locale: "fr",
    });
  });

  test("falls back to Paris and English on missing or junk context", () => {
    expect(
      newMemberDefaults({
        memberId: "u1",
        name: "  ",
        context: { timezone: "Mars/Olympus" },
      }),
    ).toMatchObject({
      householdName: "Home",
      timezone: "Europe/Paris",
      locale: "en",
    });
    expect(
      newMemberDefaults({ memberId: "u1", name: "A", context: null }).timezone,
    ).toBe("Europe/Paris");
  });
});

describe("signUpContextSchema", () => {
  test("refuses oversized values", () => {
    expect(
      signUpContextSchema.safeParse({ timezone: "x".repeat(200) }).success,
    ).toBe(false);
  });
});

describe("localeFrom", () => {
  test("maps language tags to the two app languages", () => {
    expect(localeFrom("fr-FR")).toBe("fr");
    expect(localeFrom("FR")).toBe("fr");
    expect(localeFrom("en-GB")).toBe("en");
    expect(localeFrom("de")).toBe("en");
    expect(localeFrom(null)).toBe("en");
  });
});
