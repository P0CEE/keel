"use client";

import { useState } from "react";

import styles from "./categories-settings.module.css";
import { LeafGlyph } from "./category-picker";
import {
  useCategoryDisplay,
  useCreateSubcategory,
  useDeleteMapping,
  useMappings,
  useTaxonomy,
  useUpdateSubcategory,
} from "./queries";
import { categoryTree, type CategoryView } from "./taxonomy";
import { SettingsSection } from "@/components/settings/settings-section";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  ICON_PICKER_GLYPHS,
  type IconPickerGlyph,
} from "@keel/ui/finance/category-glyphs";
import {
  IconPicker,
  type IconPickerLabels,
} from "@keel/ui/finance/icon-picker";
import { Button, RoundButton } from "@keel/ui/mint/button";
import { TrashIcon } from "@keel/ui/mint/icons";
import {
  MenuItem,
  MenuMoreTrigger,
  MenuPopup,
  MenuRoot,
} from "@keel/ui/mint/menu";
import { Select } from "@keel/ui/mint/select";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { TextField } from "@keel/ui/mint/text-field";

const NAME_MAX = 40;

function useIconLabels(name: string): IconPickerLabels {
  const t = useScopedI18n("categories");
  const iconNames = Object.fromEntries(
    ICON_PICKER_GLYPHS.map((icon) => [icon, t(`icon_names.${icon}`)]),
  ) as Record<IconPickerGlyph, string>;
  return {
    tile: () => t("icon_tile", { name }),
    title: t("icon_title", { name }),
    icons: t("icons"),
    iconNames,
  };
}

function pickerGlyph(icon: string): IconPickerGlyph {
  return (ICON_PICKER_GLYPHS as readonly string[]).includes(icon)
    ? (icon as IconPickerGlyph)
    : "bag";
}

/**
 * The household's categories, in the household settings: its own
 * subcategories under keel's (ADR 0012), and its merchant rules.
 */
export function CategoriesSettings() {
  const t = useScopedI18n("categories");
  const locale = useCurrentLocale();
  const { views, loaded } = useTaxonomy();
  const display = useCategoryDisplay();
  const mappings = useMappings();
  const remove = useDeleteMapping();
  const [editing, setEditing] = useState<CategoryView | "new" | null>(null);
  const own = categoryTree(views, locale, { archived: true }).flatMap((group) =>
    group.leaves
      .filter(({ leaf }) => leaf.own)
      .map(({ leaf, name }) => ({ leaf, name, parent: group.name })),
  );

  return (
    <>
      <SettingsSection title={t("title")} help={t("help")} loading={!loaded}>
        {own.length === 0 ? null : (
          <ul className={styles.rows}>
            {own.map(({ leaf, name, parent }) => (
              <li key={leaf.id} className={styles.row}>
                <LeafGlyph display={display(leaf.id)} />
                <span className={styles.who}>
                  <span className={styles.name}>{name}</span>
                  <span className={styles.meta}>
                    {leaf.archived ? `${parent} · ${t("archived")}` : parent}
                  </span>
                </span>
                <SubcategoryMenu
                  leaf={leaf}
                  name={name}
                  onRename={() => setEditing(leaf)}
                />
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setEditing("new")}
          >
            {t("add")}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t("mappings_title")} help={t("mappings_help")}>
        {mappings.length === 0 ? (
          <p className={styles.empty}>{t("no_mapping")}</p>
        ) : (
          <ul className={styles.rows}>
            {mappings.map((mapping) => {
              const leaf = display(mapping.categoryId);
              return (
                <li key={mapping.id} className={styles.row}>
                  <LeafGlyph display={leaf} />
                  <span className={styles.who}>
                    <span className={styles.name}>
                      {mapping.matcher === "merchant"
                        ? mapping.label
                        : t("keyword", { pattern: mapping.pattern })}
                    </span>
                    <span className={styles.meta}>{leaf?.name ?? ""}</span>
                  </span>
                  <RoundButton
                    label={t("delete_mapping")}
                    variant="tertiary"
                    size="small"
                    onClick={() => remove.mutate({ mappingId: mapping.id })}
                  >
                    <TrashIcon />
                  </RoundButton>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <SubcategorySheet editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SubcategoryMenu({
  leaf,
  name,
  onRename,
}: {
  readonly leaf: CategoryView;
  readonly name: string;
  readonly onRename: () => void;
}) {
  const t = useScopedI18n("categories");
  const update = useUpdateSubcategory();
  return (
    <MenuRoot>
      <MenuMoreTrigger label={t("options", { name })} />
      <MenuPopup side="bottom" align="end">
        <MenuItem onClick={onRename}>{t("rename")}</MenuItem>
        <MenuItem
          onClick={() =>
            update.mutate({ id: leaf.id, archived: !leaf.archived })
          }
        >
          {leaf.archived ? t("unarchive") : t("archive")}
        </MenuItem>
      </MenuPopup>
    </MenuRoot>
  );
}

/** Add a subcategory under a keel category, or rename and re-icon one. */
function SubcategorySheet({
  editing,
  onClose,
}: {
  readonly editing: CategoryView | "new" | null;
  readonly onClose: () => void;
}) {
  const t = useScopedI18n("categories");
  const locale = useCurrentLocale();
  const { views } = useTaxonomy();
  const display = useCategoryDisplay();
  const create = useCreateSubcategory();
  const update = useUpdateSubcategory();
  const existing = editing === "new" || editing === null ? null : editing;
  const groups = categoryTree(views, locale);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [icon, setIcon] = useState<IconPickerGlyph | null>(null);
  const parent =
    parentId ?? existing?.parentId ?? groups[0]?.category.id ?? null;
  const parentView = groups.find(
    (group) => group.category.id === parent,
  )?.category;
  const shownName =
    name === "" && existing !== null ? (existing.name ?? "") : name;
  const shownIcon =
    icon ?? pickerGlyph(existing?.icon ?? parentView?.icon ?? "bag");
  const trimmed = shownName.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX;
  const labels = useIconLabels(trimmed === "" ? t("name") : trimmed);

  const reset = () => {
    setName("");
    setParentId(null);
    setIcon(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const save = () => {
    if (!valid || parent === null) return;
    if (existing === null) {
      create.mutate({ parentId: parent, name: trimmed, icon: shownIcon });
    } else {
      update.mutate({ id: existing.id, name: trimmed, icon: shownIcon });
    }
    close();
  };
  const items = groups.map((group) => ({
    value: group.category.id,
    label: group.name,
  }));

  return (
    <Sheet
      open={editing !== null}
      onOpenChange={(open) => (open ? undefined : close())}
    >
      <SheetTitle>{existing === null ? t("add") : t("rename")}</SheetTitle>
      <SheetBody>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className={styles.nameRow}>
            <IconPicker
              value={{
                icon: shownIcon,
                // A subcategory wears its category's colour: no colour row.
                color: display(parent)?.color ?? "neutral",
              }}
              onChange={(choice) => setIcon(choice.icon)}
              labels={labels}
            />
            <TextField
              label={t("name")}
              value={shownName}
              maxLength={NAME_MAX}
              autoFocus
              error={shownName === "" || valid ? undefined : t("name_error")}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
          {existing === null ? (
            <Select
              value={parent}
              items={items}
              onValueChange={(value) => setParentId(value)}
            >
              <Select.Trigger label={t("parent")} filled>
                <Select.Value />
                <Select.Icon />
              </Select.Trigger>
              <Select.Content matchTriggerWidth>
                {items.map((item) => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          ) : null}
        </form>
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={close}>
          {t("cancel")}
        </SheetAction>
        <SheetAction disabled={!valid} onClick={save}>
          {existing === null ? t("create") : t("save")}
        </SheetAction>
      </SheetActions>
    </Sheet>
  );
}
