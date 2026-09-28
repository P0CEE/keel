"use client";

import { useDeferredValue, useMemo, useState } from "react";

import styles from "./accounts.module.css";
import { useInstitutions, useStartConnection } from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";
import { Select } from "@keel/ui/mint/select";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { TextField } from "@keel/ui/mint/text-field";

// The countries Enable Banking serves (EEA and the United Kingdom).
const COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

/**
 * Pick a bank and leave for its consent page. The list is the country's
 * most connected banks until the member types; the query is deferred, not
 * debounced, so typing never waits on a timer and the previous list stays
 * on screen while the next one loads.
 */
export function ConnectSheet({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useScopedI18n("connect");
  const locale = useCurrentLocale();
  const [country, setCountry] = useState("FR");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const banks = useInstitutions(country, deferred).data ?? [];
  const start = useStartConnection();
  const leavingFor =
    start.isPending || start.isSuccess ? start.variables : undefined;

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return COUNTRIES.map((code) => ({
      value: code,
      label: names.of(code) ?? code,
    })).sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale]);

  const leaving = banks.find((bank) => bank.id === leavingFor?.institutionId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} maxHeight={720}>
      <SheetTitle>{t("title")}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <div className={styles.pickerFields}>
        <Select
          value={country}
          items={countries}
          onValueChange={(value) => {
            if (value !== null) setCountry(value);
          }}
        >
          <Select.Trigger label={t("country")} filled>
            <Select.Value />
            <Select.Icon />
          </Select.Trigger>
          <Select.Content matchTriggerWidth>
            {countries.map((item) => (
              <Select.Item key={item.value} value={item.value}>
                {item.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <TextField
          label={t("search")}
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <SheetBody>
        {leaving === undefined ? null : (
          <p className={styles.status} role="status">
            {t("redirecting", { bank: leaving.name })}
          </p>
        )}
        {banks.length === 0 && deferred.trim() !== "" ? (
          <p className={styles.empty}>
            {t("no_result", { query: deferred.trim() })}
          </p>
        ) : (
          <ul className={styles.rows}>
            {banks.map((bank) => (
              <li key={bank.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.row}
                  disabled={leavingFor !== undefined}
                  onClick={() =>
                    start.mutate({
                      institutionId: bank.id,
                      psuType: bank.psuTypes.includes("personal")
                        ? "personal"
                        : "business",
                    })
                  }
                >
                  <MerchantLogo name={bank.name} src={bank.logoUrl} size={32} />
                  <span className={styles.who}>
                    <span className={styles.name}>{bank.name}</span>
                  </span>
                  {bank.psuTypes.includes("personal") ? null : (
                    <span className={styles.badge}>{t("business")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </SheetAction>
      </SheetActions>
    </Sheet>
  );
}
