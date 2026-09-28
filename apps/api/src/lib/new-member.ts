import { z } from "zod";

import type { Locale, NewMember } from "@keel/db/members";
import { DEFAULT_CURRENCY } from "@keel/finance/currencies";
import { DEFAULT_TIME_ZONE, isTimeZone } from "@keel/finance/dates";

/**
 * What the browser tells the API at sign-up, through the OAuth state
 * (`signIn.social({ additionalData })`). Untrusted: anything unexpected is
 * dropped and the defaults apply.
 */
export const signUpContextSchema = z.object({
  timezone: z.string().max(64).optional(),
  locale: z.string().max(35).optional(),
});

export type SignUpContext = z.infer<typeof signUpContextSchema>;

/** The member's language, from a BCP 47 tag ("fr-CA" -> "fr"). */
export function localeFrom(tag: string | null | undefined): Locale {
  return tag?.toLowerCase().startsWith("fr") === true ? "fr" : "en";
}

/** A new member's household of one, from whatever the sign-up told us. */
export function newMemberDefaults(input: {
  readonly memberId: string;
  readonly name: string;
  readonly context: SignUpContext | null;
}): NewMember {
  const timezone = input.context?.timezone;
  return {
    memberId: input.memberId,
    householdName: input.name.trim() === "" ? "Home" : input.name.trim(),
    baseCurrency: DEFAULT_CURRENCY,
    timezone:
      timezone !== undefined && isTimeZone(timezone)
        ? timezone
        : DEFAULT_TIME_ZONE,
    locale: localeFrom(input.context?.locale),
  };
}
