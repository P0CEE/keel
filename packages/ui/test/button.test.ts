import { describe, expect, test } from "bun:test";

import { createClickGate } from "../src/mint/button/click-gate";

describe("createClickGate", () => {
  test("a click that returns nothing holds nothing", () => {
    const gate = createClickGate();
    let clicks = 0;
    const held = gate.run(
      () => {
        clicks += 1;
      },
      () => {},
    );
    expect(held).toBeNull();
    expect(clicks).toBe(1);
    expect(gate.isBusy()).toBe(false);
  });

  test("a promise holds the gate until it settles, then releases it", async () => {
    const gate = createClickGate();
    let settled = 0;
    let finish: () => void = () => {};
    const held = gate.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      () => {
        settled += 1;
      },
    );
    expect(held).not.toBeNull();
    expect(gate.isBusy()).toBe(true);
    finish();
    await held;
    expect(gate.isBusy()).toBe(false);
    expect(settled).toBe(1);
  });

  test("a second click while one runs does nothing", async () => {
    const gate = createClickGate();
    let clicks = 0;
    const click = () => {
      clicks += 1;
      return Promise.resolve();
    };
    const first = gate.run(click, () => {});
    const second = gate.run(click, () => {});
    expect(second).toBeNull();
    expect(clicks).toBe(1);
    await first;
    gate.run(click, () => {});
    expect(clicks).toBe(2);
  });

  test("a rejection releases the gate and is passed on, not swallowed", async () => {
    const gate = createClickGate();
    let settled = 0;
    const held = gate.run(
      () => Promise.reject(new Error("declined")),
      () => {
        settled += 1;
      },
    );
    if (held === null) throw new Error("the rejecting click held nothing");
    const reason = await held.then(
      () => null,
      (error: unknown) => error,
    );
    expect(reason).toEqual(new Error("declined"));
    expect(gate.isBusy()).toBe(false);
    expect(settled).toBe(1);
  });
});
