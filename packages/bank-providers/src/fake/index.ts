/**
 * @keel/bank-providers/fake: a scenario-driven bank with no network, for
 * tests and for local development without a bank (ADR 0005).
 */
export { createFakeProvider, type FakeProviderConfig } from "./provider";
export {
  DEFAULT_SCENARIOS,
  type FakeAccount,
  type FakeFailure,
  type FakeScenario,
  type FakeTransaction,
} from "./scenarios";
