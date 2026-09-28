import { expect, test } from "bun:test";

import { lanes } from "../src/lanes";
import { queueNames } from "@keel/jobs";

const env = {
  PORT: 8080,
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgres://localhost/keel",
  WORKER_CONCURRENCY_BANK_SYNC: 2,
  WORKER_CONCURRENCY_BANK_PIPELINE: 4,
  WORKER_CONCURRENCY_DEFAULT: 5,
  BANKING_PROVIDER: "fake" as const,
  ENABLEBANKING_REDIRECT_URL: "http://localhost:3001/v1/bank/callback",
  NODE_ENV: "test" as const,
};

test("every queue has a lane", () => {
  expect(Object.keys(lanes(env)).sort()).toEqual([...queueNames].sort());
});

test("only the aggregator lane is rate limited", () => {
  const byQueue = lanes(env);
  expect(byQueue["bank-sync"].limiter).toBeDefined();
  expect(byQueue["bank-pipeline"].limiter).toBeUndefined();
  expect(byQueue.default.limiter).toBeUndefined();
});
