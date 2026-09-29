import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import {
  createSubcategory,
  deleteMapping,
  mappingsView,
  PATTERN_MAX,
  saveMapping,
  SUBCATEGORY_NAME_MAX,
  taxonomyView,
  updateSubcategory,
} from "@keel/banking";

/** Tags the realtime events a write causes with the tab that made it. */
function origin(clientId: string | null) {
  return clientId === null ? {} : { originClientId: clientId };
}

const icon = z.string().regex(/^[a-z][a-z-]{1,23}$/);

/**
 * The taxonomy the member sees (the system's and the household's own
 * subcategories), and the household's subcategories themselves.
 */
export const categoriesRouter = router({
  list: bankingProcedure.query(({ ctx }) =>
    taxonomyView(bankingDeps(), ctx.scope),
  ),

  create: bankingProcedure
    .input(
      z.object({
        parentId: z.uuid(),
        name: z.string().max(SUBCATEGORY_NAME_MAX * 2),
        icon,
      }),
    )
    .mutation(({ ctx, input }) =>
      createSubcategory(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  update: bankingProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z
          .string()
          .max(SUBCATEGORY_NAME_MAX * 2)
          .optional(),
        icon: icon.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      updateSubcategory(bankingDeps(), ctx.scope, {
        id: input.id,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
        ...origin(ctx.clientId),
      }),
    ),
});

/** The household's merchant mappings: the rule prompt's answer, and their list. */
export const mappingsRouter = router({
  list: bankingProcedure.query(({ ctx }) =>
    mappingsView(bankingDeps(), ctx.scope),
  ),

  save: bankingProcedure
    .input(
      z.object({
        matcher: z.enum(["merchant", "keyword"]),
        pattern: z.string().max(PATTERN_MAX * 2),
        categoryId: z.uuid(),
      }),
    )
    .mutation(({ ctx, input }) =>
      saveMapping(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  delete: bankingProcedure
    .input(z.object({ mappingId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      deleteMapping(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),
});
