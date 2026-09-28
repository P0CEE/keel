"use client";

import { RollingNumber } from "./rolling-number";
import { formatMoneyParts, type SignDisplay } from "@keel/finance/money";

export type AnimatedAmountProps = {
  readonly minor: number;
  readonly currency: string;
  readonly locale: string;
  readonly sign?: SignDisplay;
};

/** An amount whose changed digits roll when it moves (a balance, a total). */
export function AnimatedAmount({
  minor,
  currency,
  locale,
  sign,
}: AnimatedAmountProps) {
  const parts = formatMoneyParts(minor, currency, { locale, sign });
  const text = parts.map((part) => part.value).join("");
  const separators = {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ",",
    group:
      parts.find((part) => part.type === "group")?.value ?? groupOf(locale),
  };
  return <RollingNumber text={text} separators={separators} />;
}

// The group separator of a locale, for amounts too small to show one yet:
// it must still be known so a later 1 000 keys its cell right.
function groupOf(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1_000_000)
      .find((part) => part.type === "group")?.value ?? " "
  );
}
