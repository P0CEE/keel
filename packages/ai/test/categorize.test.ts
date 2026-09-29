import { describe, expect, test } from "bun:test";

import { firstInShape } from "../src/categorize";

class Malformed extends Error {}

const isMalformed = (error: unknown) => error instanceof Malformed;

describe("firstInShape", () => {
  test("the first model in shape answers", async () => {
    const asked: string[] = [];
    const answer = await firstInShape(
      ["luna", "luna", "flash"],
      (model) => {
        asked.push(model);
        return Promise.resolve(`from ${model}`);
      },
      isMalformed,
    );
    expect(answer).toBe("from luna");
    expect(asked).toEqual(["luna"]);
  });

  test("an answer out of shape is asked again, then of the fallback", async () => {
    const asked: string[] = [];
    const answer = await firstInShape(
      ["luna", "luna", "flash"],
      (model) => {
        asked.push(model);
        return model === "flash"
          ? Promise.resolve("from flash")
          : Promise.reject(new Malformed("degenerate JSON"));
      },
      isMalformed,
    );
    expect(answer).toBe("from flash");
    expect(asked).toEqual(["luna", "luna", "flash"]);
  });

  test("any other error is thrown at once, for the job's retries", async () => {
    const asked: string[] = [];
    const error = await firstInShape(
      ["luna", "flash"],
      (model) => {
        asked.push(model);
        return Promise.reject(new Error("gateway down"));
      },
      isMalformed,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(asked).toEqual(["luna"]);
  });

  test("when every model is out of shape, the last failure is thrown", async () => {
    const error = await firstInShape(
      ["luna", "flash"],
      () => Promise.reject(new Malformed("degenerate JSON")),
      isMalformed,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Malformed);
  });
});
