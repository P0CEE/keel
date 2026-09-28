import { env } from "../env";
import { getRealtime } from "../realtime";
import { createRedisConsentStore } from "./consent-store";
import { type BankingDeps, createProviders } from "@keel/banking";
import { getRedis } from "@keel/cache/redis";

let deps: BankingDeps | undefined;

/** The banking modules' adapters for this API instance, built once. */
export function bankingDeps(): BankingDeps {
  deps ??= {
    providers: createProviders({
      current: env.BANKING_PROVIDER,
      production: env.NODE_ENV === "production",
      redirectUrl: env.ENABLEBANKING_REDIRECT_URL,
      ...(env.ENABLEBANKING_APPLICATION_ID === undefined ||
      env.ENABLE_BANKING_KEY_CONTENT === undefined
        ? {}
        : {
            enableBanking: {
              applicationId: env.ENABLEBANKING_APPLICATION_ID,
              privateKey: env.ENABLE_BANKING_KEY_CONTENT,
            },
          }),
    }),
    consents: createRedisConsentStore(getRedis()),
    emit: getRealtime().emit,
    now: () => new Date(),
  };
  return deps;
}
