import { ProviderError } from "../errors";
import { currencyExponent, parseMinor } from "@keel/finance/money";

// Enable Banking writes every amount as a plain decimal with a dot ("1234.5",
// "-12.50"). `parseMinor` also reads human grouping, where "1.234" in euros is
// a thousand; here a dot is always the decimal point, so the text is checked
// against the strict form first and never reaches that reading.
const BANK_DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * The exact minor units of a bank amount, sign kept. Trailing zeros past the
 * currency's precision are fine ("12.500" EUR); a real digit there would need
 * rounding, and money is never rounded on the way in, so it is refused.
 */
export function parseAmount(text: string, currency: string): number {
  const match = BANK_DECIMAL.exec(text.trim());
  if (!match) throw unreadable(text, currency);
  const [, sign = "", integer = "", fraction = ""] = match;
  try {
    const significant = fraction.replace(/0+$/, "");
    if (significant.length > currencyExponent(currency)) {
      throw unreadable(text, currency);
    }
    const decimal = significant === "" ? "" : `.${significant}`;
    return parseMinor(`${sign}${integer}${decimal}`, currency);
  } catch (cause) {
    if (cause instanceof ProviderError) throw cause;
    throw unreadable(text, currency, cause);
  }
}

function unreadable(
  text: string,
  currency: string,
  cause?: unknown,
): ProviderError {
  return new ProviderError({
    kind: "invalid_request",
    message: `Enable Banking sent an amount that cannot be read exactly: "${text}" ${currency}`,
    cause,
  });
}
