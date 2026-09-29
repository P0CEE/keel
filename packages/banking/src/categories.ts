import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { loadTaxonomy } from "./taxonomy";
import { type Scope, withScope } from "@keel/db";
import {
  type CategoryRow,
  insertCategory,
  updateCategory,
} from "@keel/db/banking";
import type { CategoryNature } from "@keel/finance/taxonomy";

type Origin = { readonly originClientId?: string };

export const SUBCATEGORY_NAME_MAX = 40;
// A glyph name of `@keel/ui/finance/category-glyphs`; the app offers only
// those, and the shape keeps anything else out of the column.
const ICON = /^[a-z][a-z-]{1,23}$/;

/**
 * One node of the taxonomy as the app reads it. A system node carries its
 * key (its names are in `@keel/finance/taxonomy`); a household's own carries
 * its name. Leaves inherit their category's nature and colour.
 */
export type CategoryView = {
  readonly id: string;
  readonly key: string | null;
  readonly parentId: string | null;
  readonly name: string | null;
  readonly nature: CategoryNature;
  readonly color: string;
  readonly icon: string;
  readonly isCatchAll: boolean;
  readonly archived: boolean;
  /** The household's own subcategory: it may rename or archive it. */
  readonly own: boolean;
};

function view(row: CategoryRow): CategoryView {
  const own = row.householdId !== null;
  return {
    id: row.id,
    key: row.key,
    parentId: row.parentId,
    name: own ? row.name : null,
    nature: row.nature,
    color: row.color,
    icon: row.icon,
    isCatchAll: row.isCatchAll,
    archived: row.archivedAt !== null,
    own,
  };
}

/** The whole taxonomy a member sees: the system's and the household's own. */
export function taxonomyView(
  deps: Pick<BankingDeps, "database">,
  scope: Scope,
): Promise<readonly CategoryView[]> {
  return withScope(
    scope,
    async ({ tx }) => (await loadTaxonomy(tx, scope)).rows.map(view),
    deps.database,
  );
}

function checkName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed === "" || trimmed.length > SUBCATEGORY_NAME_MAX) {
    throw new BankingError(
      "invalid",
      `A name is 1 to ${SUBCATEGORY_NAME_MAX} characters`,
    );
  }
  return trimmed;
}

function checkIcon(icon: string): string {
  if (!ICON.test(icon)) throw new BankingError("invalid", "Unknown icon");
  return icon;
}

/**
 * A household's own subcategory, under a system category (ADR 0012): its
 * nature and colour are the category's, its icon the member's.
 */
export function createSubcategory(
  deps: Pick<BankingDeps, "database" | "emit">,
  scope: Scope,
  input: {
    readonly parentId: string;
    readonly name: string;
    readonly icon: string;
  } & Origin,
): Promise<CategoryView> {
  const name = checkName(input.name);
  const icon = checkIcon(input.icon);
  return withScope(
    scope,
    async (unit) => {
      const parent = (await loadTaxonomy(unit.tx, scope)).byId.get(
        input.parentId,
      );
      if (
        parent === undefined ||
        parent.parentId !== null ||
        parent.householdId !== null
      ) {
        throw new BankingError("not_found", "Unknown category");
      }
      const created = await insertCategory(unit.tx, scope, {
        parentId: parent.id,
        name,
        nature: parent.nature,
        color: parent.color,
        icon,
      }).catch((error: unknown) => {
        throw new BankingError(
          "conflict",
          "A subcategory has this name",
          error,
        );
      });
      deps.emit(unit, "categories.changed", {}, originOf(input));
      return view(created);
    },
    deps.database,
  );
}

/**
 * Rename, change the icon of, archive or bring back a household's own
 * subcategory. Archived, it leaves the pickers; its rows keep it.
 */
export function updateSubcategory(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  scope: Scope,
  input: {
    readonly id: string;
    readonly name?: string;
    readonly icon?: string;
    readonly archived?: boolean;
  } & Origin,
): Promise<CategoryView> {
  return withScope(
    scope,
    async (unit) => {
      const updated = await updateCategory(unit.tx, scope, input.id, {
        ...(input.name === undefined ? {} : { name: checkName(input.name) }),
        ...(input.icon === undefined ? {} : { icon: checkIcon(input.icon) }),
        ...(input.archived === undefined
          ? {}
          : { archivedAt: input.archived ? deps.now() : null }),
      }).catch((error: unknown) => {
        throw new BankingError(
          "conflict",
          "A subcategory has this name",
          error,
        );
      });
      if (updated === null)
        throw new BankingError("not_found", "Unknown subcategory");
      deps.emit(unit, "categories.changed", {}, originOf(input));
      return view(updated);
    },
    deps.database,
  );
}

function originOf(input: Origin): { readonly originClientId?: string } {
  return input.originClientId === undefined
    ? {}
    : { originClientId: input.originClientId };
}
