"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useHousehold, useSettings, useUpdateSettings } from "./queries";
import { SettingsSection } from "./settings-section";
import styles from "./settings.module.css";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  CURRENCIES,
  currencyName,
  DEFAULT_CURRENCY,
  isCurrency,
} from "@keel/finance/currencies";
import { SegmentedControl } from "@keel/ui/mint/segmented-control";
import { Select } from "@keel/ui/mint/select";

// The display currency select's value for "the household's currency".
const BASE = "base";

/** The member's own settings: language, appearance, display currency. */
export function SettingsView() {
  const t = useScopedI18n("settings");
  const locale = useCurrentLocale();
  const settings = useSettings().data;
  const household = useHousehold().data;
  const update = useUpdateSettings();
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored choice once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const stored = household?.baseCurrency;
  const baseCurrency =
    stored !== undefined && isCurrency(stored) ? stored : DEFAULT_CURRENCY;
  const currencyItems = [
    {
      value: BASE,
      label: t("currency_household", {
        currency: `${currencyName(baseCurrency, locale)} (${baseCurrency})`,
      }),
    },
    ...CURRENCIES.map((code) => ({
      value: code,
      label: `${currencyName(code, locale)} (${code})`,
    })),
  ];
  const currencyValue = settings?.displayCurrency ?? BASE;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("title")}</h1>

      <SettingsSection
        title={t("language")}
        help={t("language_help")}
        loading={settings === undefined}
      >
        <div className={styles.segments}>
          <SegmentedControl
            variant="inset"
            aria-label={t("language")}
            value={settings?.locale ?? locale}
            onValueChange={(value) => {
              if (value === "en" || value === "fr") {
                update.mutate({ locale: value });
              }
            }}
          >
            <SegmentedControl.Item value="fr">Français</SegmentedControl.Item>
            <SegmentedControl.Item value="en">English</SegmentedControl.Item>
          </SegmentedControl>
        </div>
      </SettingsSection>

      <SettingsSection title={t("appearance")} help={t("appearance_help")}>
        <div className={styles.segments}>
          <SegmentedControl
            variant="inset"
            aria-label={t("appearance")}
            value={mounted ? (theme ?? "system") : "system"}
            onValueChange={setTheme}
          >
            <SegmentedControl.Item value="light">
              {t("light")}
            </SegmentedControl.Item>
            <SegmentedControl.Item value="dark">
              {t("dark")}
            </SegmentedControl.Item>
            <SegmentedControl.Item value="system">
              {t("system")}
            </SegmentedControl.Item>
          </SegmentedControl>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("display_currency")}
        help={t("display_currency_help")}
        loading={settings === undefined || household === undefined}
      >
        <Select
          value={currencyValue}
          items={currencyItems}
          onValueChange={(value) => {
            if (value === null) return;
            update.mutate({
              displayCurrency:
                value === BASE
                  ? null
                  : (CURRENCIES.find((code) => code === value) ?? null),
            });
          }}
        >
          <Select.Trigger label={t("currency")} filled>
            <Select.Value />
            <Select.Icon />
          </Select.Trigger>
          <Select.Content matchTriggerWidth>
            {currencyItems.map((item) => (
              <Select.Item key={item.value} value={item.value}>
                {item.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </SettingsSection>
    </div>
  );
}
