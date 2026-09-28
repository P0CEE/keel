import { z } from "zod";

/**
 * The realtime events (ADR 0016): a name and a Zod payload schema each, and
 * no event outside this registry. Events carry ids, months, accounts and
 * counts, never an amount or a label: the app refetches what it needs through
 * tRPC, under row-level security. Each lot adds the events it emits.
 *
 * This module is client-safe: the app imports it for its invalidation table.
 */
export const eventSchemas = {
  /** The household's shared settings changed (name, currency, timezone). */
  "household.updated": z.object({}).strict(),
  /** A member's own settings changed; sent with `privateTo` that member. */
  "member.settings-updated": z.object({}).strict(),
} as const satisfies EventSchemas;

export type EventSchemas = Readonly<Record<string, z.ZodType>>;

export type AppEvents = typeof eventSchemas;

export type EventName<S extends EventSchemas> = keyof S & string;

/** One event of a registry, discriminated by name. */
export type EventOf<S extends EventSchemas> = {
  [N in EventName<S>]: { readonly name: N; readonly payload: z.infer<S[N]> };
}[EventName<S>];

export type EventMeta = {
  /** The tab that caused the write; it already applied it optimistically. */
  readonly originClientId?: string;
  /** Set when the event concerns a private account: only its owner gets it. */
  readonly privateTo?: string;
};

/** What a household's stream stores. */
export type Envelope<S extends EventSchemas> = EventOf<S> & EventMeta;

/**
 * What a subscriber receives: an event, or `resync` when events it missed
 * are gone from the stream and it must refetch everything.
 */
export type Delivery<S extends EventSchemas> =
  | { readonly kind: "event"; readonly event: Envelope<S> }
  | { readonly kind: "resync" };

const storedEnvelope = z.object({
  name: z.string(),
  payload: z.unknown(),
  originClientId: z.string().optional(),
  privateTo: z.string().optional(),
});

/**
 * Parse an envelope read back from a stream against the registry. Returns
 * null for an unknown name or a payload that no longer matches its schema
 * (an entry written by an older deploy), which the reader then skips.
 */
export function parseEnvelope<S extends EventSchemas>(
  schemas: S,
  raw: unknown,
): Envelope<S> | null {
  const stored = storedEnvelope.safeParse(raw);
  if (!stored.success || !Object.hasOwn(schemas, stored.data.name)) {
    return null;
  }
  const { name, payload, originClientId, privateTo } = stored.data;
  const schema = schemas[name];
  const parsed = schema?.safeParse(payload);
  if (!parsed?.success) {
    return null;
  }
  return {
    name,
    payload: parsed.data,
    ...(originClientId === undefined ? {} : { originClientId }),
    ...(privateTo === undefined ? {} : { privateTo }),
  } as Envelope<S>;
}
