"use client";

import { useState } from "react";

import { useHousehold, useUpdateHousehold } from "./queries";
import { SettingsSection } from "./settings-section";
import styles from "./settings.module.css";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { CURRENCIES, currencyName, isCurrency } from "@keel/finance/currencies";
import { listTimeZones, timeZoneLabel } from "@keel/finance/dates";
import { Select } from "@keel/ui/mint/select";
import { TextField } from "@keel/ui/mint/text-field";

const NAME_MAX = 80;

/**
 * The household's shared settings: its name, what it counts in, and the
 * clock that decides "today" and "this month". Only the owner changes them.
 */
export function HouseholdView() {
  const t = useScopedI18n("household");
  const locale = useCurrentLocale();
  const household = useHousehold().data;
  const update = useUpdateHousehold();
  const readOnly = household !== undefined && household.role !== "owner";

  const [zones] = useState(() =>
    listTimeZones().map((zone) => ({
      value: zone,
      label: timeZoneLabel(zone, locale),
    })),
  );
  const currencyItems = CURRENCIES.map((code) => ({
    value: code,
    label: `${currencyName(code, locale)} (${code})`,
  }));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("title")}</h1>
      {readOnly ? <p className={styles.note}>{t("owner_only")}</p> : null}

      <SettingsSection
        title={t("name")}
        help={t("name_help")}
        loading={household === undefined}
      >
        {household === undefined ? null : (
          <NameField
            // A new stored name (another tab, another member) resets the field.
            key={household.name}
            initial={household.name}
            label={t("name")}
            error={t("name_error", { max: NAME_MAX })}
            disabled={readOnly}
            onSave={(name) => update.mutate({ name })}
          />
        )}
      </SettingsSection>

      <SettingsSection
        title={t("money_and_time")}
        help={t("money_and_time_help")}
        loading={household === undefined}
      >
        <Select
          value={household?.baseCurrency ?? null}
          items={currencyItems}
          disabled={readOnly}
          onValueChange={(value) => {
            if (value !== null && isCurrency(value)) {
              update.mutate({ baseCurrency: value });
            }
          }}
        >
          <Select.Trigger label={t("base_currency")} filled>
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

        <Select
          value={household?.timezone ?? null}
          items={zones}
          disabled={readOnly}
          onValueChange={(value) => {
            if (value !== null) update.mutate({ timezone: value });
          }}
        >
          <Select.Trigger label={t("timezone")} filled>
            <Select.Value />
            <Select.Icon />
          </Select.Trigger>
          <Select.Content matchTriggerWidth>
            {zones.map((zone) => (
              <Select.Item key={zone.value} value={zone.value}>
                {zone.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </SettingsSection>
    </div>
  );
}

// Saves when the field is left or Enter is pressed, only a real change.
function NameField({
  initial,
  label,
  error,
  disabled,
  onSave,
}: {
  readonly initial: string;
  readonly label: string;
  readonly error: string;
  readonly disabled: boolean;
  readonly onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX;
  const save = () => {
    if (valid && trimmed !== initial) onSave(trimmed);
  };
  return (
    <TextField
      label={label}
      value={value}
      disabled={disabled}
      maxLength={NAME_MAX}
      error={valid ? undefined : error}
      onChange={(event) => setValue(event.currentTarget.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
