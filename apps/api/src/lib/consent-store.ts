import type { Redis } from "ioredis";
import { z } from "zod";

import type {
  ConsentStore,
  OfferedAccountView,
  PendingConsent,
} from "@keel/banking";

const pendingKey = (nonce: string) => `bank:consent:${nonce}`;
const offerKey = (connectionId: string) => `bank:offer:${connectionId}`;

const pendingSchema = z.object({
  intent: z.enum(["connect", "reconnect"]),
  connectionId: z.uuid(),
  householdId: z.uuid(),
  memberId: z.string().min(1),
  institutionId: z.uuid(),
  psuType: z.enum(["personal", "business"]),
});

const offerSchema = z.array(
  z.object({
    stableRef: z.string(),
    accountRef: z.string(),
    name: z.string().nullable(),
    iban: z.string().nullable(),
    currency: z.string().nullable(),
    kind: z.enum(["current", "savings", "card", "loan", "other"]),
    balance: z
      .object({
        minor: z.number().int(),
        currency: z.string(),
        asOf: z.string().nullable(),
      })
      .nullable(),
    suggested: z.boolean(),
    followed: z.boolean(),
    unavailable: z.boolean(),
  }),
);

// What comes back from Redis is re-validated: it crossed a process boundary.
function parse<T>(schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw === null) return null;
  const parsed = schema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

/**
 * The consent store on Redis: a pending consent is read and deleted in one
 * GETDEL, so a nonce answers once even under a double callback.
 */
export function createRedisConsentStore(redis: Redis): ConsentStore {
  return {
    putPending: async (nonce, pending: PendingConsent, ttlSeconds) => {
      await redis.set(
        pendingKey(nonce),
        JSON.stringify(pending),
        "EX",
        ttlSeconds,
      );
    },
    takePending: async (nonce) =>
      parse(pendingSchema, await redis.getdel(pendingKey(nonce))),
    putOffer: async (connectionId, offer, ttlSeconds) => {
      await redis.set(
        offerKey(connectionId),
        JSON.stringify(offer),
        "EX",
        ttlSeconds,
      );
    },
    getOffer: async (
      connectionId,
    ): Promise<readonly OfferedAccountView[] | null> =>
      parse(offerSchema, await redis.get(offerKey(connectionId))),
    dropOffer: async (connectionId) => {
      await redis.del(offerKey(connectionId));
    },
  };
}
