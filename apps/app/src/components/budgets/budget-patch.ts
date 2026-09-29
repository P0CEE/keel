import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@keel/api";
import { levelOf } from "@keel/finance/budgets";

export type BudgetsRead = inferRouterOutputs<AppRouter>["budgets"]["overview"];

/**
 * The running month's read with one budget set, changed or ended, as the
 * page shows it until the server answers (pure, so it is tested without a
 * cache): the line's amount and level move; a category whose spending was
 * unbudgeted takes its line with that spending; an ended budget's line
 * goes. Its spending going back to "unbudgeted", and nested sub-budgets,
 * are left to the refetch that follows.
 */
export function withBudget(
  read: BudgetsRead,
  categoryId: string,
  amountMinor: number | null,
): BudgetsRead {
  const { lines, unbudgeted } = read.tree;
  const existing = lines.find((line) => line.categoryId === categoryId);
  const loose = unbudgeted.find((entry) => entry.categoryId === categoryId);
  const nextLines =
    amountMinor === null
      ? lines.filter((line) => line.categoryId !== categoryId)
      : existing === undefined
        ? [
            ...lines,
            {
              categoryId,
              amountMinor,
              spentMinor: loose?.spentMinor ?? 0,
              count: loose?.count ?? 0,
              level: levelOf(loose?.spentMinor ?? 0, amountMinor),
              children: [],
            },
          ]
        : lines.map((line) =>
            line.categoryId === categoryId
              ? {
                  ...line,
                  amountMinor,
                  level: levelOf(line.spentMinor, amountMinor),
                }
              : line,
          );
  const nextUnbudgeted =
    amountMinor === null || loose === undefined
      ? unbudgeted
      : unbudgeted.filter((entry) => entry.categoryId !== categoryId);
  const sum = (items: readonly { spentMinor: number }[]) =>
    items.reduce((total, item) => total + item.spentMinor, 0);
  return {
    ...read,
    tree: {
      lines: nextLines,
      unbudgeted: nextUnbudgeted,
      totals: {
        budgetedMinor: nextLines.reduce(
          (total, line) => total + line.amountMinor,
          0,
        ),
        spentMinor: sum(nextLines),
        unbudgetedMinor: sum(nextUnbudgeted),
        allMinor: read.tree.totals.allMinor,
      },
    },
  };
}
