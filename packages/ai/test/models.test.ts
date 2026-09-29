import { describe, expect, test } from "bun:test";

import { MODEL_ROLES, modelFor } from "../src/models";

describe("modelFor", () => {
  test("a role runs on its default without configuration", () => {
    expect(modelFor("categorize", {})).toBe(MODEL_ROLES.categorize.default);
    expect(modelFor("categorizeFallback", {})).toBe(
      MODEL_ROLES.categorizeFallback.default,
    );
  });

  test("its environment variable overrides it", () => {
    expect(
      modelFor("categorize", { AI_MODEL_CATEGORIZE: "google/some-model" }),
    ).toBe("google/some-model");
  });

  test("a blank variable keeps the default", () => {
    expect(modelFor("categorize", { AI_MODEL_CATEGORIZE: "  " })).toBe(
      MODEL_ROLES.categorize.default,
    );
  });

  test("each role reads its own variable", () => {
    expect(
      modelFor("categorizeFallback", { AI_MODEL_CATEGORIZE: "openai/other" }),
    ).toBe(MODEL_ROLES.categorizeFallback.default);
  });
});
