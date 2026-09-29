"use client";

import { monthlySpend } from "./figures";
import { useCashflow } from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { CashFlow } from "@keel/ui/finance/cash-flow";
import { MonthlySpend } from "@keel/ui/finance/monthly-spend";

/** Money in and out, month by month; out is spending, set aside and sent away. */
export function CashFlowBlock() {
  const t = useScopedI18n("home");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const { data } = useCashflow();
  if (data === undefined) return null;
  return (
    <CashFlow
      months={data.months.map((month) => ({
        month: month.month,
        inMinor: month.moneyIn,
        outMinor: month.moneyOut,
      }))}
      currency={data.currency}
      locale={locale}
      labels={{
        name: t("cash_flow_name"),
        title: t("cash_flow"),
        moneyIn: t("money_in"),
        moneyOut: t("money_out"),
        chart: t("cash_flow_chart"),
      }}
    />
  );
}

/** Spending alone, month by month (the expense flow, refunds netted). */
export function MonthlySpendBlock() {
  const t = useScopedI18n("home");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const { data } = useCashflow();
  if (data === undefined) return null;
  return (
    <MonthlySpend
      months={monthlySpend(data.months)}
      currency={data.currency}
      locale={locale}
      labels={{ chart: t("monthly_title") }}
    />
  );
}
