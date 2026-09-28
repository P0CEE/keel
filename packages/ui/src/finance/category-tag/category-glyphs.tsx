import type { ReactNode } from "react";

// The categories' icons, mint-pocs' Transactions set: drawn on the Icon
// picker's grid (24, round strokes, 2.25 at 16px). Housing, health and
// "to categorize" are drawn to the same grid, as mint-pocs has none.

export type CategoryGlyphName =
  | "dining"
  | "transport"
  | "income"
  | "transfer"
  | "entertainment"
  | "music"
  | "shopping"
  | "travel"
  | "housing"
  | "health"
  | "uncategorized";

const ART: Record<CategoryGlyphName, ReactNode> = {
  dining: (
    <>
      <path d="M7 3.5v5.5a2 2 0 0 0 4 0V3.5M9 3.5v17" />
      <path d="M16.5 3.5c-1.7 0-3 2-3 4.5s1.3 4 3 4 3-1.5 3-4-1.3-4.5-3-4.5ZM16.5 12v8.5" />
    </>
  ),
  transport: (
    <>
      <path d="M5.5 13 7 9a2 2 0 0 1 1.9-1.3h6.2A2 2 0 0 1 17 9l1.5 4" />
      <rect x="3.5" y="13" width="17" height="4.5" rx="1.5" />
      <path d="M6 17.5v1.5M18 17.5v1.5M7.5 15.25h1M15.5 15.25h1" />
    </>
  ),
  income: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 9.2C14.1 8.4 13.2 8 12 8c-1.5 0-2.6.8-2.6 2 0 2.8 5.3 1.5 5.3 4.4 0 1.2-1.1 2-2.7 2-1.2 0-2.1-.5-2.6-1.3M12 6.5V8m0 8.4v1.1" />
    </>
  ),
  transfer: <path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5" />,
  entertainment: (
    <>
      <rect x="4" y="9.5" width="16" height="10.5" rx="2" />
      <path d="M4 9.5l1.1-3.9a1.5 1.5 0 0 1 1.8-1l11.1 3a1.5 1.5 0 0 1 1 1.8L18.8 9.5M8.4 5.1l1.5 4.2M13 6.4l1.4 3.1" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6.5l10-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 8v10a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V8Z" />
      <path d="M9 10a3 3 0 0 0 6 0" />
    </>
  ),
  travel: (
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
  ),
  // the rail's house outline, its door open at the foot
  housing: (
    <path d="M4 10.4c0-.6.27-1.17.74-1.55l6-4.9a2 2 0 0 1 2.52 0l6 4.9c.47.38.74.95.74 1.55V18a2 2 0 0 1-2 2h-3.25v-4.25a1.75 1.75 0 0 0-3.5 0V20H6a2 2 0 0 1-2-2v-7.6Z" />
  ),
  health: (
    <>
      <path d="M12 20s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.5 2.9C19.5 15.6 12 20 12 20Z" />
      <path d="M8.5 12.5h2l1-2 1.5 4 1-2h1.5" />
    </>
  ),
  uncategorized: (
    <>
      <path d="M3.5 5.5v5.1a2 2 0 0 0 .6 1.4l7.9 7.9a2 2 0 0 0 2.8 0l5.1-5.1a2 2 0 0 0 0-2.8L12 4.1a2 2 0 0 0-1.4-.6H5.5a2 2 0 0 0-2 2Z" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </>
  ),
};

/** A category's icon at 16px, in the tag's ink. Decorative. */
export function CategoryGlyph({
  name,
  size = 16,
}: {
  readonly name: CategoryGlyphName;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ART[name]}
    </svg>
  );
}
