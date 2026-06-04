import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import { optimisticListMutation } from "../src/trpc/optimistic";

type Item = { id: string; done: boolean };

const KEY = ["tasks", "list"] as const;

function seededClient(items: Item[]): QueryClient {
  const client = new QueryClient();
  client.setQueryData(KEY, items);
  return client;
}

describe("optimisticListMutation", () => {
  test("applies the optimistic patch to the cached list on mutate", async () => {
    const client = seededClient([{ id: "1", done: false }]);
    const handlers = optimisticListMutation<Item, { id: string }>(
      client,
      KEY,
      (current, { id }) =>
        current.map((item) =>
          item.id === id ? { ...item, done: true } : item,
        ),
    );

    await handlers.onMutate({ id: "1" });

    expect(client.getQueryData(KEY)).toEqual([{ id: "1", done: true }]);
  });

  test("rolls back to the snapshot on error", async () => {
    const original = [{ id: "1", done: false }];
    const client = seededClient(original);
    const handlers = optimisticListMutation<Item, { id: string }>(
      client,
      KEY,
      (current, { id }) => current.filter((item) => item.id !== id),
    );

    const context = await handlers.onMutate({ id: "1" });
    expect(client.getQueryData(KEY)).toEqual([]);

    handlers.onError(new Error("server rejected"), { id: "1" }, context);
    expect(client.getQueryData(KEY)).toEqual(original);
  });

  test("treats an empty cache as an empty list", async () => {
    const client = new QueryClient();
    const handlers = optimisticListMutation<Item, Item>(
      client,
      KEY,
      (current, item) => [item, ...current],
    );

    const context = await handlers.onMutate({ id: "new", done: false });

    expect(context.previous).toBeUndefined();
    expect(client.getQueryData(KEY)).toEqual([{ id: "new", done: false }]);
  });
});
