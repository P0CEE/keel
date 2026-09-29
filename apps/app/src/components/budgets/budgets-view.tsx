"use client";

import { type CSSProperties, type ReactNode, useState } from "react";

import { BudgetSheet } from "./budget-sheet";
import styles from "./budgets.module.css";
import {
  type BudgetLine,
  type BudgetsRead,
  type BudgetSuggestion,
  useBudgets,
  useBudgetsHistory,
  useBudgetSuggestions,
  usePrefetchBudgets,
  useSetBudget,
} from "./queries";
import { SavingsTargetSheet } from "./savings-target-sheet";
import { useCategoryDisplay } from "@/components/categories/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { savingsShare } from "@keel/finance/budgets";
import { addMonths, formatMonth, startOfMonth } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { Amount } from "@keel/ui/finance/amount";
import { CategoryBudget } from "@keel/ui/finance/category-budget";
import { categoryVar } from "@keel/ui/finance/category-colors";
import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { MonthlySpend } from "@keel/ui/finance/monthly-spend";
import { Privacy } from "@keel/ui/finance/privacy";
import {
  UnlockAmount,
  UnlockLead,
  UnlockProgress,
} from "@keel/ui/finance/unlock-progress";
import { Button } from "@keel/ui/mint/button";
import { Card } from "@keel/ui/mint/card";
import { IconButton } from "@keel/ui/mint/icon-button";
import { ChevronBackIcon, ChevronForwardIcon } from "@keel/ui/mint/icons";
import { useToasts } from "@keel/ui/mint/toast";

type Editing = {
  readonly categoryId: string | null;
  readonly amountMinor: number | null;
};

/**
 * Budgets (provisional screen, redrawn with the home in lot 8): the
 * month's budgets as mint-pocs' category budget rows, what no budget
 * covers, the six months before; beside them the savings target and the
 * suggestions. Past months read only: a budget written now applies from
 * the running month on.
 */
export function BudgetsView() {
  const t = useScopedI18n("budgets");
  const appLocale = useCurrentLocale();
  const locale = appLocale === "fr" ? "fr-FR" : "en-US";
  // Null is the running month: its key is the one the realtime table and
  // the optimistic writes use.
  const [month, setMonth] = useState<string | null>(null);
  const read = useBudgets(month).data;
  const history = useBudgetsHistory(month).data;
  const prefetch = usePrefetchBudgets();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);

  if (read === undefined) return null;
  const current = startOfMonth(read.today);
  const go = (target: string) => setMonth(target >= current ? null : target);
  const previous = addMonths(read.month, -1);
  const next = addMonths(read.month, 1);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <nav
          className={styles.monthNav}
          aria-label={t("months")}
          onPointerEnter={() => {
            void prefetch(previous);
            if (next <= current) void prefetch(next >= current ? null : next);
          }}
        >
          <IconButton
            size={32}
            label={t("previous_month")}
            onClick={() => go(previous)}
          >
            <ChevronBackIcon size={16} />
          </IconButton>
          <h1 className={styles.monthName}>
            {formatMonth(read.month, locale, {
              length: "long",
              withYear: true,
            })}
          </h1>
          <IconButton
            size={32}
            label={t("next_month")}
            disabled={next > current}
            onClick={() => go(next)}
          >
            <ChevronForwardIcon size={16} />
          </IconButton>
        </nav>
        <Summary read={read} locale={locale} />
        <Lines
          read={read}
          locale={locale}
          onEdit={(line) =>
            setEditing({
              categoryId: line.categoryId,
              amountMinor: line.amountMinor,
            })
          }
        />
        {read.editable ? (
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                setEditing({ categoryId: null, amountMinor: null })
              }
            >
              {t("add")}
            </Button>
          </div>
        ) : null}
        <Unbudgeted
          read={read}
          locale={locale}
          onBudget={(categoryId, spentMinor) =>
            setEditing({ categoryId, amountMinor: roundUp(spentMinor) })
          }
        />
        {history === undefined ? null : (
          <section className={styles.section}>
            <div className={styles.head}>
              <h2 className={styles.title}>{t("history")}</h2>
            </div>
            <p className={styles.help}>{t("history_help")}</p>
            <MonthlySpend
              months={history.months.map((entry) => ({
                month: entry.month,
                minor: Math.max(entry.spentMinor, 0),
              }))}
              currency={history.currency}
              locale={locale}
              labels={{ chart: t("history") }}
            />
          </section>
        )}
      </div>
      <aside className={styles.aside}>
        <SavingsCard
          read={read}
          locale={locale}
          onEdit={() => setTargetOpen(true)}
        />
        {read.editable ? (
          <SuggestionsCard
            currency={read.currency}
            locale={locale}
            onPick={(suggestion) =>
              setEditing({
                categoryId: suggestion.categoryId,
                amountMinor: suggestion.amountMinor,
              })
            }
          />
        ) : null}
      </aside>
      <BudgetSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        categoryId={editing?.categoryId ?? null}
        amountMinor={editing?.amountMinor ?? null}
        budgeted={new Set(read.tree.lines.map((line) => line.categoryId))}
        exists={
          editing?.categoryId != null &&
          read.tree.lines.some((line) => line.categoryId === editing.categoryId)
        }
        currency={read.currency}
        locale={locale}
      />
      <SavingsTargetSheet
        open={targetOpen}
        onOpenChange={setTargetOpen}
        targetMinor={read.savings.targetMinor}
        currency={read.currency}
        locale={locale}
      />
    </div>
  );
}

/** Ten of the currency above what was spent, as a first budget to adjust. */
function roundUp(minor: number): number | null {
  if (minor <= 0) return null;
  return Math.ceil(minor / 10_00) * 10_00;
}

function Summary({
  read,
  locale,
}: {
  readonly read: BudgetsRead;
  readonly locale: string;
}) {
  const t = useScopedI18n("budgets");
  const { budgetedMinor, spentMinor } = read.tree.totals;
  if (read.tree.lines.length === 0) {
    return (
      <section className={styles.emptyState}>
        <h2 className={styles.cardTitle}>{t("empty_title")}</h2>
        <p className={styles.cardText}>{t("empty_text")}</p>
      </section>
    );
  }
  const left = budgetedMinor - spentMinor;
  const money = (minor: number) =>
    formatMoney(minor, read.currency, { locale });
  return (
    <section className={styles.hero}>
      <span className={styles.label}>{left >= 0 ? t("left") : t("over")}</span>
      <Privacy>
        <span
          className={styles.total}
          data-tone={left < 0 ? "negative" : undefined}
        >
          {money(Math.abs(left))}
        </span>
      </Privacy>
      <Privacy>
        <span className={styles.split}>
          {t("spent_of", {
            spent: money(spentMinor),
            budgeted: money(budgetedMinor),
          })}
        </span>
      </Privacy>
    </section>
  );
}

function useBudgetLabels() {
  const t = useScopedI18n("budgets.row");
  return {
    count: (count: number) => t("count", { count }),
    of: (budget: ReactNode) => t("of", { budget }),
    over: (over: ReactNode) => t("over", { over }),
    meter: t("meter"),
    spent: (spent: string, budget: string) => t("spent", { spent, budget }),
  };
}

function Lines({
  read,
  locale,
  onEdit,
}: {
  readonly read: BudgetsRead;
  readonly locale: string;
  readonly onEdit: (line: BudgetLine) => void;
}) {
  const display = useCategoryDisplay();
  const labels = useBudgetLabels();
  if (read.tree.lines.length === 0) return null;
  return (
    <ul className={styles.lines}>
      {read.tree.lines.map((line) => {
        const shown = display(line.categoryId);
        const row = (
          <CategoryBudget
            name={shown?.name ?? ""}
            count={line.count}
            icon={
              <CategoryGlyph name={shown?.glyph ?? "uncategorized"} size={20} />
            }
            spent={line.spentMinor}
            budget={line.amountMinor}
            currency={read.currency}
            locale={locale}
            labels={labels}
            color={categoryVar(shown?.color ?? "blue")}
          />
        );
        return (
          <li key={line.categoryId}>
            {read.editable ? (
              <button
                type="button"
                className={styles.line}
                onClick={() => onEdit(line)}
              >
                {row}
              </button>
            ) : (
              <div className={styles.line}>{row}</div>
            )}
            {line.children.length === 0 ? null : (
              <ul className={styles.children}>
                {line.children.map((child) => (
                  <li key={child.categoryId} className={styles.child}>
                    <span className={styles.childName}>
                      {display(child.categoryId)?.name ?? ""}
                    </span>
                    <Privacy>
                      <span className={styles.childAmount}>
                        {child.budget === null
                          ? formatMoney(child.spentMinor, read.currency, {
                              locale,
                            })
                          : labels.spent(
                              formatMoney(child.spentMinor, read.currency, {
                                locale,
                              }),
                              formatMoney(
                                child.budget.amountMinor,
                                read.currency,
                                { locale },
                              ),
                            )}
                      </span>
                    </Privacy>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Unbudgeted({
  read,
  locale,
  onBudget,
}: {
  readonly read: BudgetsRead;
  readonly locale: string;
  readonly onBudget: (categoryId: string, spentMinor: number) => void;
}) {
  const t = useScopedI18n("budgets");
  const display = useCategoryDisplay();
  const shown = read.tree.unbudgeted.filter((entry) => entry.spentMinor > 0);
  if (shown.length === 0) return null;
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("unbudgeted")}</h2>
        <Amount
          minor={read.tree.totals.unbudgetedMinor}
          currency={read.currency}
          locale={locale}
          className={styles.amount}
        />
      </div>
      <ul className={styles.rows}>
        {shown.map((entry) => {
          const category = display(entry.categoryId);
          return (
            <li key={entry.categoryId} className={styles.item}>
              <div className={styles.row}>
                <span
                  className={styles.glyph}
                  style={
                    {
                      "--glyph-color": categoryVar(category?.color ?? "blue"),
                    } as CSSProperties
                  }
                >
                  <CategoryGlyph
                    name={category?.glyph ?? "uncategorized"}
                    size={16}
                  />
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{category?.name ?? ""}</span>
                  <span className={styles.meta}>
                    {t("row.count", { count: entry.count })}
                  </span>
                </span>
                <span className={styles.end}>
                  <Amount
                    minor={entry.spentMinor}
                    currency={read.currency}
                    locale={locale}
                    className={styles.amount}
                  />
                  {read.editable ? (
                    <Button
                      variant="transparent"
                      size="small"
                      onClick={() =>
                        onBudget(entry.categoryId, entry.spentMinor)
                      }
                    >
                      {t("set")}
                    </Button>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The savings target, as mint-pocs' unlock progress: what the month set
 * aside against it, in the cards-inset composition.
 */
function SavingsCard({
  read,
  locale,
  onEdit,
}: {
  readonly read: BudgetsRead;
  readonly locale: string;
  readonly onEdit: () => void;
}) {
  const t = useScopedI18n("budgets.savings");
  const { targetMinor, setAsideMinor } = read.savings;
  const money = (minor: number) => (
    <Privacy>{formatMoney(minor, read.currency, { locale })}</Privacy>
  );
  return (
    <Card variant="inset">
      <Card variant="elevated">
        {targetMinor === null ? (
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>{t("none_title")}</h2>
            <p className={styles.cardText}>{t("none_text")}</p>
          </div>
        ) : (
          <UnlockProgress
            progress={savingsShare(setAsideMinor, targetMinor)}
            headline={
              <>
                <UnlockLead>{t("lead")}</UnlockLead>{" "}
                {t("headline", {
                  saved: (
                    <UnlockAmount>
                      {money(Math.max(setAsideMinor, 0))}
                    </UnlockAmount>
                  ),
                  target: money(targetMinor),
                })}
              </>
            }
            completeHeadline={
              <>
                <UnlockLead>{t("done_lead")}</UnlockLead>{" "}
                {t("done", {
                  saved: <UnlockAmount>{money(setAsideMinor)}</UnlockAmount>,
                })}
              </>
            }
            labels={{
              bar: t("bar"),
              progress: (percent) => t("progress", { percent }),
              complete: t("complete"),
            }}
          />
        )}
      </Card>
      {read.editable ? (
        <div className={styles.buttonRow}>
          <Button fullWidth onClick={onEdit}>
            {targetMinor === null ? t("set") : t("edit")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Budgets worth adding, from the months before, in the cards-inset composition. */
function SuggestionsCard({
  currency,
  locale,
  onPick,
}: {
  readonly currency: string;
  readonly locale: string;
  readonly onPick: (suggestion: BudgetSuggestion) => void;
}) {
  const t = useScopedI18n("budgets.suggestions");
  const display = useCategoryDisplay();
  const suggestions = useBudgetSuggestions().data?.suggestions ?? [];
  const setBudget = useSetBudget();
  const toasts = useToasts();
  const errors = useScopedI18n("budgets");
  const first = suggestions[0];
  if (first === undefined) return null;
  return (
    <Card variant="inset">
      <Card variant="elevated">
        <div className={styles.cardBody}>
          <h2 className={styles.cardTitle}>
            {t("title", { count: suggestions.length })}
          </h2>
          <p className={styles.cardText}>{t("text")}</p>
          <ul className={styles.rows}>
            {suggestions.map((suggestion) => {
              const category = display(suggestion.categoryId);
              return (
                <li key={suggestion.categoryId} className={styles.item}>
                  <div className={styles.row}>
                    <span
                      className={styles.glyph}
                      style={
                        {
                          "--glyph-color": categoryVar(
                            category?.color ?? "blue",
                          ),
                        } as CSSProperties
                      }
                    >
                      <CategoryGlyph
                        name={category?.glyph ?? "uncategorized"}
                        size={16}
                      />
                    </span>
                    <span className={styles.who}>
                      <span className={styles.name}>
                        {category?.name ?? ""}
                      </span>
                      <Privacy>
                        <span className={styles.meta}>
                          {t("average", {
                            amount: formatMoney(
                              suggestion.averageMinor,
                              currency,
                              { locale },
                            ),
                          })}
                        </span>
                      </Privacy>
                    </span>
                    <span className={styles.end}>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => onPick(suggestion)}
                      >
                        <Privacy>
                          {formatMoney(suggestion.amountMinor, currency, {
                            locale,
                          })}
                        </Privacy>
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
      <div className={styles.buttonRow}>
        <Button
          fullWidth
          onClick={() => {
            for (const suggestion of suggestions) {
              setBudget.mutate(
                {
                  categoryId: suggestion.categoryId,
                  amountMinor: suggestion.amountMinor,
                },
                {
                  onError: () =>
                    toasts.add({ title: errors("error"), type: "error" }),
                },
              );
            }
          }}
        >
          {t("apply_all", { count: suggestions.length })}
        </Button>
      </div>
    </Card>
  );
}
