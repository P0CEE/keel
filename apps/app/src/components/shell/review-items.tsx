import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { RepeatIcon } from "@keel/ui/mint/icons";
import type { DockAction } from "@keel/ui/mint/sidebar-dock";

/**
 * What waits for the member, shown by the rail's dock. Sample data until the
 * review queue exists: it will then be a household read model the server
 * renders with the shell, so the dock is there from the first paint, never
 * published by a page after hydration.
 */
export const REVIEW_ITEMS: readonly DockAction[] = [
  {
    id: "uncategorized",
    title: "12 transactions à catégoriser",
    detail: "Depuis le 3 septembre",
    icon: <CategoryGlyph name="uncategorized" />,
    href: "/transactions",
  },
  {
    id: "recurring",
    title: "Navigo revient chaque mois",
    detail: "Confirmer la série",
    logo: { name: "Navigo" },
    href: "/transactions",
  },
  {
    id: "bank",
    title: "Crédit Mutuel à reconnecter",
    detail: "Le consentement expire dans 3 jours",
    logo: { name: "Crédit Mutuel" },
    href: "/accounts",
  },
  {
    id: "series",
    title: "Loyer pas encore passé",
    detail: "Attendu le 5 septembre",
    icon: <RepeatIcon size={16} />,
    href: "/transactions",
  },
];
