"use client";

import { Privacy } from "../privacy/privacy";
import { RollingNumber } from "./rolling-number";
import { localeSeparators } from "./slots";
import { formatMoney, type SignDisplay } from "@keel/finance/money";

export type AnimatedAmountProps = {
  readonly minor: number;
  readonly currency: string;
  readonly locale: string;
  readonly sign?: SignDisplay;
};

/**
 * An amount whose changed digits roll when it moves (a balance, a total).
 * Privacy mode masks it; revealed, it shows still and rolls from there.
 */
export function AnimatedAmount({
  minor,
  currency,
  locale,
  sign,
}: AnimatedAmountProps) {
  const text = formatMoney(minor, currency, { locale, sign });
  return (
    <Privacy>
      <RollingNumber text={text} separators={localeSeparators(locale)} />
    </Privacy>
  );
}
