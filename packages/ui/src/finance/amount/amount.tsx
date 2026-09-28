import styles from "./amount.module.css";
import { formatMoney, type SignDisplay } from "@keel/finance/money";

export type AmountProps = {
  readonly minor: number;
  readonly currency: string;
  readonly locale: string;
  /** "negative" (default), "always" for flows (+ for money in), "never" for magnitudes. */
  readonly sign?: SignDisplay;
  /** Money in reads in the positive green. */
  readonly tone?: boolean;
  readonly className?: string;
};

/**
 * An amount, formatted from minor units: tabular figures so digits never
 * jitter, a true minus, no sign on zero.
 */
export function Amount({
  minor,
  currency,
  locale,
  sign,
  tone,
  className,
}: AmountProps) {
  const direction = minor > 0 ? "in" : minor < 0 ? "out" : "zero";
  return (
    <span
      className={className ? `${styles.amount} ${className}` : styles.amount}
      data-direction={direction}
      data-tone={tone ? true : undefined}
    >
      {formatMoney(minor, currency, { locale, sign })}
    </span>
  );
}
