"use client";

import type { SeriesView } from "./queries";
import styles from "./recurring.module.css";
import { logoOf, useCadenceLabel } from "./series-display";
import { priceOf } from "./series-rows";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { Amount } from "@keel/ui/finance/amount";
import { Button } from "@keel/ui/mint/button";
import { Card } from "@keel/ui/mint/card";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

/** How many suggestions the card lists; the review goes through them all. */
const SHOWN = 5;

/**
 * What the machine found and the member has not answered, as mint-pocs'
 * cards-inset composes a side panel: the elevated card in the well, the
 * primary button under it. The button walks the suggestions one sheet
 * after the other; a row opens its own.
 */
export function SuggestionsCard({
  suggestions,
  currency,
  onOpen,
  onHover,
}: {
  readonly suggestions: readonly SeriesView[];
  readonly currency: string;
  readonly onOpen: (id: string) => void;
  readonly onHover: (id: string) => void;
}) {
  const t = useScopedI18n("recurring");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const cadence = useCadenceLabel();
  const first = suggestions[0];
  if (first === undefined) return null;
  return (
    <Card variant="inset">
      <Card variant="elevated">
        <div className={styles.suggestions}>
          <h2 className={styles.cardTitle}>
            {t("suggestions_count", { count: suggestions.length })}
          </h2>
          <p className={styles.cardText}>{t("suggestions_text")}</p>
          <ul className={styles.rows}>
            {suggestions.slice(0, SHOWN).map((item) => {
              const price = priceOf(item, currency);
              return (
                <li key={item.id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => onOpen(item.id)}
                    onPointerEnter={() => onHover(item.id)}
                  >
                    <MerchantLogo
                      name={item.name}
                      src={logoOf(item)}
                      size={32}
                    />
                    <span className={styles.who}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.meta}>
                        {cadence(item.cadence)}
                      </span>
                    </span>
                    <span className={styles.end}>
                      <Amount
                        minor={price.minor}
                        currency={price.currency}
                        locale={locale}
                        sign="always"
                        tone
                        className={styles.amount}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
      <div className={styles.buttonRow}>
        <Button fullWidth onClick={() => onOpen(first.id)}>
          {t("review")}
        </Button>
      </div>
    </Card>
  );
}
