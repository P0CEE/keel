"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { LinkComponent } from "../app-rail/nav";
import { useSize } from "../hooks/use-size";
import { MerchantLogo } from "../logo/merchant-logo";
import { ease } from "../motion";
import { keyLabel } from "../shortcuts/shortcuts";
import { useSidebarLayer } from "./sidebar-popup";
import styles from "./sidebar.module.css";

export type DockAction = {
  readonly id: string;
  /** What waits ("12 transactions à catégoriser"). */
  readonly title: string;
  /** What to do, or since when ("Confirmer la série"). */
  readonly detail?: string;
  /** A merchant's or a bank's mark, when the action is about one. */
  readonly logo?: { readonly name: string; readonly src?: string | null };
  /** A glyph otherwise, drawn on inverted ink as a lettermark. */
  readonly icon?: ReactNode;
  readonly href: string;
};

export type SidebarDockProps = {
  readonly items: readonly DockAction[];
  /** The panel's title ("À traiter"). */
  readonly title: string;
  /** The dock's tooltip ("Actions à traiter"). */
  readonly hint: string;
  readonly shortcut?: string;
  /** The dock's accessible name, from the count ("4 actions à traiter"). */
  readonly describe: (count: number) => string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The panel's width: what the viewport leaves right of the rail (the Sidebar measures it). */
  readonly panelWidth: number;
  readonly linkComponent?: LinkComponent;
};

const MARK = 24; // px, a mark in the stack
const HEAD = 64; // px, the panel's title row
const MAX_HEIGHT = 428;

type Morph = {
  readonly from: { width: number; height: number };
  readonly width: number;
  readonly height: number;
  readonly reduce: boolean;
};

// The panel grows from the dock and shrinks back to it (custom: the sizes);
// its list fades in once it is nearly grown and out before it shrinks.
const shell: Variants = {
  closed: ({ from, reduce }: Morph) =>
    reduce
      ? { opacity: 0, transition: { duration: 0.15 } }
      : {
          width: from.width,
          height: from.height,
          borderRadius: 20,
          transition: { duration: 0.4, ease: ease.sheet },
        },
  open: ({ width, height, reduce }: Morph) => ({
    width,
    height,
    borderRadius: 24,
    opacity: 1,
    transition: reduce
      ? { duration: 0.15 }
      : { duration: 0.55, ease: ease.sheet },
  }),
};
const inside: Variants = {
  closed: { opacity: 0, transition: { duration: 0.12, ease: ease.exit } },
  open: {
    opacity: 1,
    transition: { duration: 0.25, delay: 0.22, ease: ease.enter },
  },
};

/**
 * The Order dock of mint-pocs' Sidebar, carrying what waits for the member
 * (transactions to categorize, a series to confirm, a bank to reconnect): a
 * live dot, the count and the marks stacked; a click grows it into the panel
 * that lists them, to the right of the rail; Esc or a click outside folds it
 * back. Rendered with the shell, so it is there from the first paint.
 */
export function SidebarDock({
  items,
  title,
  shortcut,
  describe,
  open,
  onOpenChange,
  panelWidth,
  linkComponent,
}: SidebarDockProps) {
  const reduce = useReducedMotion() ?? false;
  const dock = useRef<HTMLButtonElement>(null);
  const [from, setFrom] = useState({ width: 40, height: 115 });
  // while the panel is there, the dock shows only its content, above the panel's glass
  const [panelShown, setPanelShown] = useState(false);
  if (open && !panelShown) setPanelShown(true);
  const measureDock = () => {
    if (dock.current)
      setFrom({
        width: dock.current.offsetWidth,
        height: dock.current.offsetHeight,
      });
  };
  useLayoutEffect(() => {
    if (open) measureDock();
  }, [open]);
  // focus goes back to the dock as soon as it closes: it is live through the shrink
  const refocus = useRef(false);
  // closing, the dock ignores the hover spread until the pointer has left it
  // once, so it takes over at exactly the size the panel shrank to
  const [quiet, setQuiet] = useState(false);
  const close = () => {
    measureDock();
    setQuiet(true);
    onOpenChange(false);
    refocus.current = true;
  };
  if (!open && panelShown && !quiet) setQuiet(true);
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    dock.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className={styles.dockAnchor}>
      <button
        ref={dock}
        type="button"
        className={styles.dock}
        data-over={panelShown ? true : undefined}
        data-open={open ? true : undefined}
        data-quiet={quiet ? true : undefined}
        onPointerLeave={() => setQuiet(false)}
        aria-label={describe(items.length)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={shortcut ? keyLabel(shortcut) : undefined}
        onClick={() => {
          measureDock();
          onOpenChange(true);
        }}
      >
        <span className={styles.live} aria-hidden />
        <span className={styles.count} aria-hidden>
          {items.length}
        </span>
        <span className={styles.stack} aria-hidden>
          {items.map((item, index) => (
            <span
              key={item.id}
              className={styles.stackItem}
              data-lead={index === 0 ? true : undefined}
              data-covered={index < items.length - 1 ? true : undefined}
              style={{ zIndex: index }}
            >
              <Mark item={item} size={MARK} />
            </span>
          ))}
        </span>
      </button>
      <AnimatePresence
        custom={{ from, reduce }}
        onExitComplete={() => setPanelShown(false)}
      >
        {open ? (
          <Panel
            key="panel"
            items={items}
            title={title}
            from={from}
            width={panelWidth}
            reduce={reduce}
            onClose={close}
            linkComponent={linkComponent}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type PanelProps = {
  readonly items: readonly DockAction[];
  readonly title: string;
  readonly from: { width: number; height: number };
  readonly width: number;
  readonly reduce: boolean;
  readonly onClose: () => void;
  readonly linkComponent?: LinkComponent;
};

// The dock's glass grown to the right; the list laid out at its final size
// and uncovered, never reflowed.
function Panel({
  items,
  title,
  from,
  width,
  reduce,
  onClose,
  linkComponent,
}: PanelProps) {
  // false while it shrinks away; true again if the dock is clicked before it is gone
  const present = useIsPresent();
  const layer = useSidebarLayer();
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const listHeight = useSize(list).height;
  // the rows' height, up to the cap; even, so the centred list sits on whole pixels
  const height =
    Math.round(
      Math.min(
        HEAD + 1 + (listHeight > 0 ? listHeight : MAX_HEIGHT),
        MAX_HEIGHT,
      ) / 2,
    ) * 2;

  // an Esc a menu has handled is left alone: one Esc closes one thing
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  });
  // a popup of the layer is portalled out of the panel, but a click in it is
  // still a click in the panel
  const onPointer = useEffectEvent((event: PointerEvent) => {
    const target = event.target as Node;
    if (
      panel.current?.contains(target) !== true &&
      layer.current?.contains(target) !== true
    )
      onClose();
  });
  useEffect(() => {
    if (!present) return;
    panel.current?.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [present]);

  const Link = linkComponent ?? "a";
  const custom: Morph = { from, width, height, reduce };
  return (
    <motion.div
      ref={panel}
      className={styles.panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-leaving={present ? undefined : true}
      custom={custom}
      variants={shell}
      initial="closed"
      animate="open"
      exit="closed"
    >
      {/* laid out at its final size, on the dock's left edge and centred on
          it: the glass only uncovers it */}
      <motion.div
        className={styles.panelInner}
        variants={inside}
        style={{ width, height, marginTop: -height / 2 }}
      >
        <header className={styles.panelHead}>
          <h2 id={titleId} className={styles.panelTitle}>
            {title}
          </h2>
        </header>
        <div className={styles.panelScroll}>
          <div ref={list} className={styles.list}>
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={styles.row}
                onClick={onClose}
              >
                <Mark item={item} size={20} />
                <span className={styles.rowTitle}>{item.title}</span>
                {item.detail ? (
                  <span className={styles.rowDetail}>{item.detail}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// A merchant's or a bank's mark, or the action's glyph on inverted ink, as
// the Order dock draws a security without its logo.
function Mark({
  item,
  size,
}: {
  readonly item: DockAction;
  readonly size: number;
}) {
  if (item.logo)
    return (
      <MerchantLogo name={item.logo.name} src={item.logo.src} size={size} />
    );
  return (
    <span className={styles.markGlyph} style={{ width: size, height: size }}>
      {item.icon}
    </span>
  );
}
