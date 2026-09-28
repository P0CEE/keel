"use client";

import { RollingNumber } from "./rolling-number";
import { localeSeparators } from "./slots";
import { formatMoney, type SignDisplay } from "@keel/finance/money";

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
  const text = formatMoney(minor, currency, { locale, sign });
  return <RollingNumber text={text} separators={localeSeparators(locale)} />;
}
