import { describe, expect, test } from "bun:test";

import {
  labelText,
  problemOf,
  type Validity,
} from "../src/mint/text-field/validity";

const valid: Validity = {
  valueMissing: false,
  typeMismatch: false,
  tooShort: false,
  tooLong: false,
  patternMismatch: false,
  valid: true,
};

describe("problemOf", () => {
  test("a valid field, or one not checked yet, shows no error", () => {
    expect(problemOf({ validity: valid, reason: "" })).toBe("");
    expect(problemOf({ validity: { ...valid, valid: null }, reason: "" })).toBe(
      "",
    );
  });

  test("an error from outside shows whatever the value", () => {
    expect(
      problemOf({ error: "Email already in use", validity: valid, reason: "" }),
    ).toBe("Email already in use");
  });

  test("a failed check shows its words", () => {
    expect(
      problemOf({
        validity: { ...valid, typeMismatch: true, valid: false },
        messages: { typeMismatch: "Enter an email like name@example.com" },
        reason: "Please include an '@'",
      }),
    ).toBe("Enter an email like name@example.com");
  });

  test("the first failed check in order wins", () => {
    expect(
      problemOf({
        validity: {
          ...valid,
          valueMissing: true,
          tooShort: true,
          valid: false,
        },
        messages: { tooShort: "Too short", valueMissing: "Required" },
        reason: "",
      }),
    ).toBe("Required");
  });

  test("without words, the browser's or the rule's reason shows", () => {
    expect(
      problemOf({
        validity: { ...valid, tooShort: true, valid: false },
        messages: { valueMissing: "Required" },
        reason: "Use at least 8 characters",
      }),
    ).toBe("Use at least 8 characters");
    expect(
      problemOf({
        validity: { ...valid, valid: false },
        reason: "Add a number",
      }),
    ).toBe("Add a number");
  });
});

describe("labelText", () => {
  test("required={false} marks the label optional", () => {
    expect(labelText("Referral code", false, "(optional)")).toBe(
      "Referral code (optional)",
    );
  });

  test("required fields, and fields that say nothing, carry no mark", () => {
    expect(labelText("Email", true, "(optional)")).toBe("Email");
    expect(labelText("Email", undefined, "(optional)")).toBe("Email");
    expect(labelText("Email", false, undefined)).toBe("Email");
  });
});
