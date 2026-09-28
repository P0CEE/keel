import type { ComponentType, MouseEventHandler, ReactNode } from "react";

export type NavItem = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  /** What its tooltip says ("Aller aux transactions"); the label otherwise. */
  readonly hint?: string;
  readonly icon: ReactNode;
  /** The filled twin shown while the page is current. */
  readonly activeIcon?: ReactNode;
  readonly shortcut?: string;
  /** "prefix" keeps /transactions current on /transactions/123. */
  readonly match?: "exact" | "prefix";
};

/** The element links are drawn with: Next's Link in the app, an anchor by default. */
export type LinkComponent = ComponentType<{
  readonly href: string;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly "aria-label"?: string;
  readonly "aria-current"?: "page";
  readonly "aria-keyshortcuts"?: string;
  readonly onClick?: MouseEventHandler<HTMLAnchorElement>;
}>;

/**
 * The item a path belongs to: an exact match, or the longest prefix among
 * "prefix" items, so /accounts/123 is Accounts even when "/" is Home.
 */
export function currentItemId(
  pathname: string,
  items: readonly NavItem[],
): string | null {
  const path = normalize(pathname);
  const exact = items.find((item) => normalize(item.href) === path);
  if (exact) return exact.id;
  const prefixed = items
    .filter((item) => item.match === "prefix")
    .filter((item) => {
      const href = normalize(item.href);
      return href !== "/" && (path === href || path.startsWith(`${href}/`));
    })
    .sort((a, b) => normalize(b.href).length - normalize(a.href).length);
  return prefixed[0]?.id ?? null;
}

function normalize(path: string): string {
  const [bare = "/"] = path.split(/[?#]/);
  return bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
}
