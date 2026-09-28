"use client";

import { useState } from "react";

import styles from "./home-view.module.css";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { addDays, todayIn } from "@keel/finance/dates";
import { Amount } from "@keel/ui/finance/amount";
import { AnimatedAmount } from "@keel/ui/finance/animated-amount";
import { CashFlow } from "@keel/ui/finance/cash-flow";
import type { CategoryColor } from "@keel/ui/finance/category-colors";
import {
  CategoryGlyph,
  type CategoryGlyphName,
} from "@keel/ui/finance/category-glyphs";
import { CategoryTag } from "@keel/ui/finance/category-tag";
import {
  TransactionList,
  type TransactionListItem,
} from "@keel/ui/finance/transaction-list";

// Sample data for looking at the foundation, and only here: no feature reads it.
const glyph = (name: CategoryGlyphName) => <CategoryGlyph name={name} />;
const CATEGORIES: {
  label: string;
  icon: React.ReactNode;
  color: CategoryColor;
}[] = [
  { label: "Logement", icon: glyph("housing"), color: "blue" },
  { label: "Alimentation", icon: glyph("dining"), color: "purple" },
  { label: "Loisirs", icon: glyph("entertainment"), color: "pink" },
  { label: "Transports", icon: glyph("transport"), color: "yellow" },
  { label: "Shopping", icon: glyph("shopping"), color: "orange" },
  { label: "Santé", icon: glyph("health"), color: "mauve" },
  { label: "Revenus", icon: glyph("income"), color: "green" },
];

function category(label: string) {
  return CATEGORIES.find((entry) => entry.label === label) ?? null;
}

function sampleTransactions(today: string): TransactionListItem[] {
  return [
    {
      id: "1",
      label: "Monoprix",
      day: today,
      amountMinor: -2_418,
      currency: "EUR",
      accountLabel: "Compte courant",
      category: category("Alimentation"),
    },
    {
      id: "2",
      label: "Salaire",
      day: today,
      amountMinor: 284_500,
      currency: "EUR",
      accountLabel: "Compte courant",
      category: category("Revenus"),
      recurrence: "Mensuel",
    },
    {
      id: "3",
      label: "Navigo",
      day: addDays(today, -1),
      amountMinor: -8_880,
      currency: "EUR",
      accountLabel: "Compte courant",
      category: category("Transports"),
      recurrence: "Mensuel",
    },
    {
      id: "4",
      label: "Boulangerie du Marché",
      day: addDays(today, -1),
      amountMinor: -640,
      currency: "EUR",
      accountLabel: "Carte ··· 4821",
      category: null,
    },
    {
      id: "5",
      label: "Virement vers Livret A",
      day: addDays(today, -1),
      amountMinor: -30_000,
      currency: "EUR",
      accountLabel: "Compte courant",
      category: null,
      transfer: true,
    },
    {
      id: "6",
      label: "Loyer",
      day: addDays(today, -4),
      amountMinor: -98_000,
      currency: "EUR",
      accountLabel: "Compte courant",
      category: category("Logement"),
      recurrence: "Mensuel",
    },
    {
      id: "7",
      label: "Pharmacie Lafayette",
      day: addDays(today, -4),
      amountMinor: -1_290,
      currency: "EUR",
      accountLabel: "Carte ··· 4821",
      category: category("Santé"),
    },
    {
      id: "8",
      label: "Remboursement Fnac",
      day: addDays(today, -4),
      amountMinor: 4_999,
      currency: "EUR",
      accountLabel: "Carte ··· 4821",
      category: category("Shopping"),
    },
  ];
}

const FLOWS = [
  { month: "2026-07-01", inMinor: 291_240, outMinor: 268_095 },
  { month: "2026-08-01", inMinor: 290_512, outMinor: 312_044 },
  { month: "2026-09-01", inMinor: 289_450, outMinor: 243_600 },
];

/**
 * Home: the balance, the month's cash flow, the categories and the latest
 * transactions. Sample data until the banking read models exist.
 */
export function HomeView() {
  const t = useScopedI18n("home");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const [today] = useState(() => todayIn("Europe/Paris"));
  const [balance, setBalance] = useState(1_284_732);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <section className={styles.hero}>
          <button
            type="button"
            className={styles.balance}
            aria-label={t("reroll")}
            onClick={() =>
              setBalance(
                (value) => value + Math.round((Math.random() - 0.5) * 60_000),
              )
            }
          >
            <AnimatedAmount minor={balance} currency="EUR" locale={locale} />
          </button>
          <span className={styles.change}>
            <Amount
              minor={45_850}
              currency="EUR"
              locale={locale}
              sign="always"
              tone
            />{" "}
            {t("this_month")}
          </span>
        </section>

        <section className={styles.section}>
          <CashFlow
            months={FLOWS}
            currency="EUR"
            locale={locale}
            labels={{
              title: t("cash_flow"),
              moneyIn: t("money_in"),
              moneyOut: t("money_out"),
              chart: t("cash_flow_chart"),
            }}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("categories")}</h2>
          <div className={styles.tags}>
            {CATEGORIES.map((entry) => (
              <CategoryTag
                key={entry.label}
                label={entry.label}
                icon={entry.icon}
                color={entry.color}
              />
            ))}
            <CategoryTag
              label={t("uncategorized")}
              icon={glyph("uncategorized")}
            />
          </div>
        </section>
      </div>

      <aside className={styles.aside}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("transactions")}</h2>
          <TransactionList
            items={sampleTransactions(today)}
            today={today}
            locale={locale}
            labels={{ uncategorized: t("uncategorized") }}
            onSelect={() => {}}
          />
        </div>
      </aside>
    </div>
  );
}
