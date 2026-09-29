// The home's widgets and each member's arrangement of them (CONTEXT.md,
// "Home"): the registry, a stored layout read back, and the adaptive
// default the home shows until the member customizes it.
//
// The home is Wealthsimple's: its header, curve and accounts are fixed; the
// widgets are the stat cards under the curve (Mint's Spend & Save and
// profile stats cards) and the cards of the side column (For you, the
// activity, the dues strip). A layout is the widgets shown, in order; each
// group keeps the order its widgets have in the list, and a widget left out
// is hidden.

export const WIDGET_GROUPS = ["cards", "side"] as const;

export type WidgetGroup = (typeof WIDGET_GROUPS)[number];

/** Every widget and its group, in the order the customize sheet lists them. */
export const WIDGETS = {
  spending: "cards",
  disponible: "cards",
  budget: "cards",
  savings: "cards",
  everyday: "cards",
  subscriptions: "cards",
  streak: "cards",
  projection: "cards",
  "for-you": "side",
  activity: "side",
  dues: "side",
} as const satisfies Readonly<Record<string, WidgetGroup>>;

export type WidgetId = keyof typeof WIDGETS;

export const WIDGET_IDS = Object.keys(WIDGETS) as readonly WidgetId[];

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && Object.hasOwn(WIDGETS, value);
}

/** The widgets shown, in order. */
export type HomeLayout = readonly WidgetId[];

/** What `member_settings.home_layout` holds once the member customized. */
export type StoredLayout = { readonly widgets: readonly WidgetId[] };

/**
 * A stored layout read back: its known widgets, each once, in their order.
 * Null when there is none (the member never customized, or went back to
 * the default) or it is not a layout at all. A widget removed from the
 * registry since is dropped, not an error.
 */
export function readLayout(stored: unknown): HomeLayout | null {
  if (typeof stored !== "object" || stored === null) return null;
  const widgets: unknown = (stored as { widgets?: unknown }).widgets;
  if (!Array.isArray(widgets)) return null;
  return widgets
    .filter(isWidgetId)
    .filter((id, index, all) => all.indexOf(id) === index);
}

/** What the home knows of the member, for the adaptive default. */
export type HomeFacts = {
  /** A current account or a card whose balance is known. */
  readonly hasEverydayAccount: boolean;
  readonly hasBudgets: boolean;
  readonly hasSavingsTarget: boolean;
  /** A recurring series that counts (confirmed, or trusted enough). */
  readonly hasCountingSeries: boolean;
  /** A month has set money aside: the streak has something to count. */
  readonly hasSetAside: boolean;
};

/**
 * The home of a member who never customized it: the month's spending and
 * what is left of it, then a card for what they set up (budgets, a target,
 * recurring series, savings). A widget with nothing to show is left out
 * rather than empty, and joins the day its facts turn true.
 */
export function adaptiveLayout(facts: HomeFacts): HomeLayout {
  const shown: readonly (readonly [WidgetId, boolean])[] = [
    ["spending", true],
    ["budget", facts.hasBudgets],
    ["disponible", !facts.hasBudgets],
    ["savings", facts.hasSavingsTarget],
    ["everyday", facts.hasEverydayAccount],
    ["subscriptions", facts.hasCountingSeries],
    ["streak", facts.hasSetAside],
    ["projection", facts.hasEverydayAccount && facts.hasCountingSeries],
    ["for-you", true],
    ["activity", true],
    ["dues", facts.hasCountingSeries],
  ];
  return shown.filter(([, on]) => on).map(([id]) => id);
}

/** A layout's widgets by group, each group in the layout's order. */
export function byGroup(
  layout: HomeLayout,
): Readonly<Record<WidgetGroup, readonly WidgetId[]>> {
  return {
    cards: layout.filter((id) => WIDGETS[id] === "cards"),
    side: layout.filter((id) => WIDGETS[id] === "side"),
  };
}

export type ArrangedWidget = {
  readonly id: WidgetId;
  readonly shown: boolean;
};

/**
 * The customize sheet's lists: every widget of each group, the shown ones
 * first in the layout's order, then the hidden ones in the registry's.
 */
export function arrange(
  layout: HomeLayout,
): Readonly<Record<WidgetGroup, readonly ArrangedWidget[]>> {
  const groups = byGroup(layout);
  const hidden = WIDGET_IDS.filter((id) => !layout.includes(id));
  const of = (group: WidgetGroup): readonly ArrangedWidget[] => [
    ...groups[group].map((id) => ({ id, shown: true })),
    ...hidden
      .filter((id) => WIDGETS[id] === group)
      .map((id) => ({ id, shown: false })),
  ];
  return { cards: of("cards"), side: of("side") };
}

/** The layout a customize sheet stands for: its shown widgets, group by group. */
export function layoutOf(
  arranged: Readonly<Record<WidgetGroup, readonly ArrangedWidget[]>>,
): HomeLayout {
  return WIDGET_GROUPS.flatMap((group) =>
    arranged[group].filter((widget) => widget.shown).map(({ id }) => id),
  );
}

/**
 * One widget moved a step up or down its group, for the keyboard. A move
 * past either end changes nothing.
 */
export function moveWidget(
  widgets: readonly ArrangedWidget[],
  id: WidgetId,
  step: -1 | 1,
): readonly ArrangedWidget[] {
  const from = widgets.findIndex((widget) => widget.id === id);
  const to = from + step;
  const moving = widgets[from];
  const other = widgets[to];
  if (moving === undefined || other === undefined) return widgets;
  return widgets.map((widget, index) =>
    index === from ? other : index === to ? moving : widget,
  );
}
