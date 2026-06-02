import { expect, test } from "bun:test";

import { describeImage, imageDescriptionSchema } from "../src/vision";

test("imageDescriptionSchema accepts a well-formed description", () => {
  const parsed = imageDescriptionSchema.parse({
    description: "A red bicycle leaning against a brick wall.",
    tags: ["bicycle", "wall"],
    objects: [{ name: "bicycle", confidence: "high" }],
  });
  expect(parsed.objects[0]?.confidence).toBe("high");
});

test("imageDescriptionSchema rejects an invalid confidence level", () => {
  expect(() =>
    imageDescriptionSchema.parse({
      description: "x",
      tags: [],
      objects: [{ name: "x", confidence: "certain" }],
    }),
  ).toThrow();
});

// SSRF guard: describeImage must refuse to fetch a caller-supplied remote URL.
// It throws before any network/model call, so no OPENAI_API_KEY is needed.
test("describeImage rejects non-data: URLs (SSRF guard)", async () => {
  let message = "";
  try {
    await describeImage("https://169.254.169.254/latest/meta-data/");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain("data: URL");
});
