import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@keel/api";

type Outputs = inferRouterOutputs<AppRouter>;

export type TransactionsPage = Outputs["transactions"]["page"];
export type TransactionView = TransactionsPage["items"][number];
