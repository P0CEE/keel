import type { ReactNode } from "react";

// The categories' icons: mint-pocs' Icon picker set (src/demos/icon-picker),
// copied path by path, on its 24 grid with round caps and joins. A tag draws
// them at 16px with a 2.25 stroke so they hold its 12px bold text; the Icon
// picker draws the same art at its own size and 1.75 stroke, so there is one
// drawing per icon. The Transactions demo's names (dining, housing...) stay
// as aliases of the picker's drawings; "transfer" and "to categorize" are
// drawn to the same grid, as the picker has neither.

/** The Icon picker's 28 icons, in its grid order (7 columns). */
export const ICON_PICKER_GLYPHS = [
  "bag",
  "receipt",
  "gift",
  "paw",
  "baby",
  "briefcase",
  "book",
  "plane",
  "heart",
  "home",
  "car",
  "food",
  "film",
  "apple",
  "music",
  "building",
  "diamond",
  "piggy",
  "truck",
  "target",
  "graduation",
  "bank",
  "bolt",
  "people",
  "wallet",
  "dollar",
  "star",
  "pie",
] as const;

export type IconPickerGlyph = (typeof ICON_PICKER_GLYPHS)[number];

// The Transactions demo's names, each one of the picker's drawings.
const ALIASES = {
  dining: "food",
  transport: "car",
  income: "dollar",
  entertainment: "film",
  shopping: "bag",
  travel: "plane",
  housing: "home",
  health: "heart",
} as const satisfies Record<string, IconPickerGlyph>;

type Alias = keyof typeof ALIASES;

/** Every name a category icon may be stored as. */
export const CATEGORY_GLYPH_NAMES = [
  ...ICON_PICKER_GLYPHS,
  ...(Object.keys(ALIASES) as Alias[]),
  "transfer",
  "uncategorized",
] as const;

export type CategoryGlyphName = (typeof CATEGORY_GLYPH_NAMES)[number];

const NAMES: ReadonlySet<string> = new Set(CATEGORY_GLYPH_NAMES);

/** Whether a stored value names a glyph (the server validates icons with it). */
export function isCategoryGlyphName(value: string): value is CategoryGlyphName {
  return NAMES.has(value);
}

// The picker's eyes and nostrils: a dot drawn as a zero-length stroke.
const dot = (x: number, y: number) => (
  <path d={`M${x} ${y}h.01`} strokeWidth="2.4" />
);

const PICKER_ART: Record<IconPickerGlyph, ReactNode> = {
  bag: (
    <>
      <path d="M5 8a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 8v10a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V8Z" />
      <path d="M9 10a3 3 0 0 0 6 0" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25v-17Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="8.5" width="16" height="4" rx="1.25" />
      <path d="M5.5 12.5V19A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.5M12 8.5v12" />
      <path d="M12 8.5C10.6 5.2 7.2 4.6 7.2 6.8c0 1.3 2.2 1.7 4.8 1.7ZM12 8.5c1.4-3.3 4.8-3.9 4.8-1.7 0 1.3-2.2 1.7-4.8 1.7Z" />
    </>
  ),
  paw: (
    <>
      <circle cx="5.75" cy="10.25" r="1.75" />
      <circle cx="9.5" cy="6" r="1.75" />
      <circle cx="14.5" cy="6" r="1.75" />
      <circle cx="18.25" cy="10.25" r="1.75" />
      <path d="M12 11.5c-2.5 0-5 3.4-5 5.7 0 1.5 1.2 2.3 2.5 2.3.9 0 1.6-.5 2.5-.5s1.6.5 2.5.5c1.3 0 2.5-.8 2.5-2.3 0-2.3-2.5-5.7-5-5.7Z" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c-1.6.9-1.6 3.2.3 3.6" />
      <path d="M9.5 15.5c1.4 1 3.6 1 5 0" />
      {dot(9, 11.5)}
      {dot(15, 11.5)}
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17M12 11.5v2" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10.2 5.2 7.5 4.5 4 4.5v13c3.5 0 6.2.7 8 2 1.8-1.3 4.5-2 8-2v-13c-3.5 0-6.2.7-8 2Z" />
      <path d="M12 6.5v13" />
    </>
  ),
  plane: (
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
  ),
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
      <path d="M10 11.5v2M14 11.5v2M9 13.5h6v1.2a3 3 0 0 1-6 0v-1.2ZM12 17.7v2.8" />
    </>
  ),
  car: (
    <>
      <path d="M5.5 13 7 9a2 2 0 0 1 1.9-1.3h6.2A2 2 0 0 1 17 9l1.5 4" />
      <rect x="3.5" y="13" width="17" height="4.5" rx="1.5" />
      <path d="M6 17.5v1.5M18 17.5v1.5M7.5 15.25h1M15.5 15.25h1" />
    </>
  ),
  food: (
    <>
      <path d="M7 3.5v5.5a2 2 0 0 0 4 0V3.5M9 3.5v17" />
      <path d="M16.5 3.5c-1.7 0-3 2-3 4.5s1.3 4 3 4 3-1.5 3-4-1.3-4.5-3-4.5ZM16.5 12v8.5" />
    </>
  ),
  film: (
    <>
      <rect x="4" y="9.5" width="16" height="10.5" rx="2" />
      <path d="M4 9.5l1.1-3.9a1.5 1.5 0 0 1 1.8-1l11.1 3a1.5 1.5 0 0 1 1 1.8L18.8 9.5M8.4 5.1l1.5 4.2M13 6.4l1.4 3.1" />
    </>
  ),
  apple: (
    <>
      <path d="M12 7.6c-1-1-2.5-1.5-4-1-2.5.8-3.5 3.6-3 6.5.6 3.6 3 6.9 5 6.9.8 0 1.2-.4 2-.4s1.2.4 2 .4c2 0 4.4-3.3 5-6.9.5-2.9-.5-5.7-3-6.5-1.5-.5-3 0-4 1Z" />
      <path d="M12 7.6c0-2 1-3.4 3-4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6.5l10-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  building: (
    <path d="M4.5 20.5V5A1.5 1.5 0 0 1 6 3.5h6.5A1.5 1.5 0 0 1 14 5v15.5M14 10h4a1.5 1.5 0 0 1 1.5 1.5v9M3 20.5h18M8 8h2.5M8 12h2.5M8 16h2.5" />
  ),
  diamond: (
    <path d="M6.5 4.5h11L21 9.5 12 20 3 9.5l3.5-5ZM3 9.5h18M9.5 4.5 8 9.5l4 10.5 4-10.5-1.5-5" />
  ),
  piggy: (
    <>
      <path d="M19 11.5c0-3.3-3.1-5.5-7-5.5-1.2 0-2.3.2-3.3.6L6.5 5v3.2c-1.2 1-1.9 2.3-2 3.8H3v3h1.8c.6 1.2 1.6 2.2 2.7 2.8V20h3v-1.5h3V20h3v-2.4c1.5-1 2.5-2.5 2.5-4.1Z" />
      <path d="M19 11.5c1 0 1.8-.5 2-1.5" />
      {dot(8.5, 11)}
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h9A1.5 1.5 0 0 1 15 6.5v9.8M15 9.5h3.5L21 13v3.5h-1.8M5.3 16.5H3V13M9 16.5h6" />
      <circle cx="7.2" cy="17.2" r="1.8" />
      <circle cx="17.3" cy="17.2" r="1.8" />
    </>
  ),
  target: (
    <>
      <path d="M20.3 10.4A8.5 8.5 0 1 1 13.6 3.7" />
      <path d="M16.3 11.4a4.5 4.5 0 1 1-3.7-3.7" />
      <path d="M12 12l6.5-6.5M16 5.5l2.5 0 0 2.5" />
    </>
  ),
  graduation: (
    <>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" />
      <path d="M6.5 11v4.5c1.5 1.3 3.5 2 5.5 2s4-.7 5.5-2V11M21.5 9v5" />
    </>
  ),
  bank: (
    <path d="M3.5 9 12 4l8.5 5M4.5 9.5h15M6.5 10v7M10 10v7M14 10v7M17.5 10v7M3.5 20h17M4.5 17.5h15" />
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19c.5-3.2 3-5 6-5s5.5 1.8 6 5" />
      <path d="M15.5 4.9a3.25 3.25 0 0 1 0 6.2M17.5 14.3c1.8.6 3.1 2.2 3.5 4.7" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M20.5 9.5h-3.8a2.5 2.5 0 0 0 0 5h3.8" />
    </>
  ),
  dollar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 9.2C14.1 8.4 13.2 8 12 8c-1.5 0-2.6.8-2.6 2 0 2.8 5.3 1.5 5.3 4.4 0 1.2-1.1 2-2.7 2-1.2 0-2.1-.5-2.6-1.3M12 6.5V8m0 8.4v1.1" />
    </>
  ),
  star: (
    <path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6L12 16.6l-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z" />
  ),
  pie: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6 6" />
    </>
  ),
};

const OWN_ART: Record<"transfer" | "uncategorized", ReactNode> = {
  transfer: <path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5" />,
  uncategorized: (
    <>
      <path d="M3.5 5.5v5.1a2 2 0 0 0 .6 1.4l7.9 7.9a2 2 0 0 0 2.8 0l5.1-5.1a2 2 0 0 0 0-2.8L12 4.1a2 2 0 0 0-1.4-.6H5.5a2 2 0 0 0-2 2Z" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </>
  ),
};

/** The drawing of a glyph name, an alias resolved to its picker icon. */
export function glyphArt(name: CategoryGlyphName): ReactNode {
  if (name === "transfer" || name === "uncategorized") return OWN_ART[name];
  if (Object.hasOwn(ALIASES, name)) return PICKER_ART[ALIASES[name as Alias]];
  return PICKER_ART[name as IconPickerGlyph];
}

/**
 * A category's icon, in the current ink. Decorative. 16px with a 2.25 stroke
 * in a tag; the Icon picker draws it larger with its 1.75.
 */
export function CategoryGlyph({
  name,
  size = 16,
  strokeWidth = 2.25,
}: {
  readonly name: CategoryGlyphName;
  readonly size?: number;
  readonly strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyphArt(name)}
    </svg>
  );
}
