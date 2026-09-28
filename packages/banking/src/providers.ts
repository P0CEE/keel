import { providerRegistry, type ProviderRegistry } from "./deps";
import {
  type BankingProvider,
  createEnableBanking,
  decodePrivateKey,
  type ProviderId,
} from "@keel/bank-providers";
import { createFakeProvider } from "@keel/bank-providers/fake";

export type ProvidersConfig = {
  /** The aggregator new connections and the bank picker use. */
  readonly current: ProviderId;
  /** The fake bank never runs in production. */
  readonly production: boolean;
  /** Where the bank sends the member back (the API's callback). */
  readonly redirectUrl: string;
  readonly enableBanking?: {
    readonly applicationId: string;
    /** The PEM, or its base64 as Enable Banking hands it out. */
    readonly privateKey: string;
  };
};

/**
 * The aggregators a process (API or worker) can talk to. Every configured
 * adapter is registered, not only the current one, so a connection made
 * with the other keeps being served after `BANKING_PROVIDER` changes.
 */
export function createProviders(config: ProvidersConfig): ProviderRegistry {
  const real: BankingProvider | null =
    config.enableBanking === undefined
      ? null
      : createEnableBanking({
          applicationId: config.enableBanking.applicationId,
          privateKeyPem: decodePrivateKey(config.enableBanking.privateKey),
          redirectUrl: config.redirectUrl,
        });
  const fake: BankingProvider | null = config.production
    ? null
    : createFakeProvider({ redirectUrl: config.redirectUrl });
  const current = config.current === "fake" ? fake : real;
  if (current === null) {
    throw new Error(`Banking provider ${config.current} is not configured`);
  }
  return providerRegistry(
    current,
    [real, fake].flatMap((provider) =>
      provider === null || provider === current ? [] : [provider],
    ),
  );
}
