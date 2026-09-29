"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  EMPTY_TRANSACTION_FILTER,
  type TransactionFilter,
  transactionFilterFromParams,
  transactionFilterToParams,
} from "@keel/finance/transaction-filter";

const ROUTE = "/activity";

/**
 * What the transactions page's URL says: the filter, the open transaction
 * (`tx`) and the entry form (`new`). The shell mounts the page beside the
 * others, so only its own route is read: elsewhere it shows the plain list
 * and opens nothing.
 */
export function useTransactionsUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const here = pathname === ROUTE;
  const query = here ? params.toString() : "";

  const filter = useMemo(
    () =>
      here
        ? transactionFilterFromParams(new URLSearchParams(query))
        : EMPTY_TRANSACTION_FILTER,
    [here, query],
  );
  const openId = here ? params.get("tx") : null;
  const entryOpen = here && params.get("new") !== null;

  const write = useCallback(
    (next: {
      readonly filter?: TransactionFilter;
      readonly tx?: string | null;
      readonly entry?: boolean;
    }) => {
      const current = new URLSearchParams(query);
      const search = transactionFilterToParams(next.filter ?? filter);
      // Undefined keeps what is open; null closes it.
      const tx = Object.hasOwn(next, "tx")
        ? (next.tx ?? null)
        : current.get("tx");
      const entry = next.entry ?? current.get("new") !== null;
      if (tx !== null) search.set("tx", tx);
      if (entry) search.set("new", "1");
      const text = search.toString();
      router.replace(text === "" ? ROUTE : `${ROUTE}?${text}`, {
        scroll: false,
      });
    },
    [filter, query, router],
  );

  return { filter, openId, entryOpen, write };
}
