"use client";

import {
  motion,
  useDragControls,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

import type { LinkComponent, NavItem } from "../app-rail/nav";
import { useEscape } from "../hooks/use-escape";
import { useSize } from "../hooks/use-size";
import { ChevronRightIcon, SearchIcon } from "../icons/icons";
import { ease, morph, spring } from "../motion";
import {
  BAR_HEIGHT,
  barBox,
  barWidth,
  closesOnDrag,
  drawerBox,
} from "./geometry";
import styles from "./mobile-tab-bar.module.css";

export type DrawerAction = {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly tone?: "info" | "positive" | "warning" | "accent" | "neutral";
  readonly href?: string;
  readonly onSelect?: () => void;
};

export type MobileTabBarProps = {
  readonly label: string;
  /** Two or three pages. */
  readonly items: readonly NavItem[];
  readonly currentId: string | null;
  /** The button that grows the bar into its drawer. */
  readonly action: {
    readonly label: string;
    readonly icon: ReactNode;
    readonly title: string;
    readonly quickActions: readonly DrawerAction[];
    readonly rows: readonly DrawerAction[];
  };
  readonly search: { readonly label: string; readonly onSelect: () => void };
  readonly linkComponent?: LinkComponent;
};

// Once the card is nearly grown the content fades in where it sits, faint and
// blurred; then each block sharpens, top to bottom, 45ms apart. It leaves all
// at once, fast, before the card shrinks.
const cascade: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.12, ease: ease.exit } },
  shown: {
    opacity: 1,
    transition: {
      duration: 0.25,
      delay: morph.contentDelay,
      ease: ease.enter,
      delayChildren: 0.26,
      staggerChildren: 0.045,
    },
  },
};
const sharpen: Variants = {
  hidden: { opacity: 0.35, filter: "blur(6px)" },
  shown: {
    opacity: 1,
    filter: "blur(0px)",
    transitionEnd: { filter: "none" },
    transition: { duration: 0.45, ease: ease.enter },
  },
};
const fade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.2 } },
};

/**
 * The phone's floating tab bar, whose action button grows the bar itself into
 * a drawer: one shape morphs (its left, bottom, width, height and radius), so
 * the eye never loses it. Search floats beside it. Hidden on a desk, where the
 * rail navigates.
 */
export function MobileTabBar({
  label,
  items,
  currentId,
  action,
  search,
  linkComponent,
}: MobileTabBarProps) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const size = useSize(screen);
  const contentHeight = useSize(content).height;
  const drag = useDragControls();
  const titleId = useId();
  const Link = linkComponent ?? "a";

  const buttons = items.length + 1;
  const openBox = drawerBox(size, contentHeight);
  const box = open && openBox ? openBox : barBox(buttons);

  const close = () => setOpen(false);
  useEscape(close, open);

  // focus goes back to the action button once the bar is live again (it is inert while open)
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open)
      actionButton.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const onPointer = useEffectEvent((event: PointerEvent) => {
    if (!shell.current?.contains(event.target as Node)) close();
  });
  useEffect(() => {
    if (!open) return;
    drawer.current?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const pick = (entry: DrawerAction) => () => {
    entry.onSelect?.();
    close();
  };
  const entryProps = (entry: DrawerAction, className: string | undefined) => ({
    className,
    onClick: pick(entry),
  });

  return (
    <div ref={screen} className={styles.screen}>
      <motion.div
        ref={shell}
        className={styles.shell}
        data-open={open ? true : undefined}
        initial={false}
        animate={box}
        transition={reduce ? { duration: 0 } : open ? morph.open : morph.close}
        // the open drawer drags down from its grabber only, never from its list
        drag={open && !reduce ? "y" : false}
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        dragTransition={{ bounceStiffness: 440, bounceDamping: 32 }}
        onDragEnd={(_, info) => {
          if (closesOnDrag(info.offset.y, info.velocity.y)) close();
        }}
      >
        <motion.nav
          className={styles.nav}
          style={{ width: barWidth(buttons), height: BAR_HEIGHT }}
          aria-label={label}
          inert={open}
          initial={false}
          animate={
            open
              ? { opacity: 0, transition: { duration: 0.15, ease: ease.exit } }
              : {
                  opacity: 1,
                  transition: {
                    duration: 0.25,
                    delay: reduce ? 0 : morph.contentDelay,
                    ease: ease.enter,
                  },
                }
          }
        >
          {items.map((item) => {
            const current = item.id === currentId;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={styles.tab}
                aria-label={item.label}
                aria-current={current ? "page" : undefined}
              >
                {current ? (item.activeIcon ?? item.icon) : item.icon}
              </Link>
            );
          })}
          <button
            ref={actionButton}
            type="button"
            className={styles.tab}
            aria-label={action.label}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {action.icon}
          </button>
        </motion.nav>

        <motion.div
          ref={drawer}
          className={styles.drawer}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          inert={!open}
          style={{ width: openBox?.width, height: openBox?.height }}
          variants={cascade}
          initial={false}
          animate={open ? "shown" : "hidden"}
        >
          <div ref={content} className={styles.measure}>
            <motion.div
              className={styles.grabber}
              variants={reduce ? fade : sharpen}
              onPointerDown={(event) => drag.start(event)}
              aria-hidden
            >
              <span />
            </motion.div>
            <h2 id={titleId} className={styles.srOnly}>
              {action.title}
            </h2>
            <div
              className={styles.scroll}
              style={{ maxHeight: openBox ? openBox.height - 20 : undefined }}
            >
              <motion.div
                className={styles.actions}
                variants={reduce ? fade : sharpen}
              >
                {action.quickActions.map((entry) => {
                  const inner = (
                    <>
                      <span className={styles.actionCircle}>{entry.icon}</span>
                      <span className={styles.actionLabel}>{entry.label}</span>
                    </>
                  );
                  return entry.href ? (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      {...entryProps(entry, styles.action)}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      key={entry.id}
                      type="button"
                      {...entryProps(entry, styles.action)}
                    >
                      {inner}
                    </button>
                  );
                })}
              </motion.div>
              {action.rows.length > 0 ? (
                <div className={styles.list}>
                  {action.rows.map((entry) => {
                    const inner = (
                      <>
                        <span
                          className={styles.rowIcon}
                          data-tone={entry.tone ?? "neutral"}
                        >
                          {entry.icon}
                        </span>
                        <span className={styles.rowLabel}>{entry.label}</span>
                        <ChevronRightIcon
                          className={styles.chevron}
                          size={14}
                        />
                      </>
                    );
                    return (
                      <motion.div
                        key={entry.id}
                        className={styles.rowWrap}
                        variants={reduce ? fade : sharpen}
                      >
                        {entry.href ? (
                          <Link
                            href={entry.href}
                            {...entryProps(entry, styles.row)}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            {...entryProps(entry, styles.row)}
                          >
                            {inner}
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.button
        type="button"
        className={styles.search}
        aria-label={search.label}
        inert={open}
        initial={false}
        onClick={search.onSelect}
        animate={
          open
            ? {
                opacity: 0,
                scale: reduce ? 1 : 0.9,
                transition: { duration: 0.15, ease: ease.exit },
              }
            : {
                opacity: 1,
                scale: 1,
                transition: { ...spring.snap, delay: reduce ? 0 : 0.2 },
              }
        }
      >
        <SearchIcon size={22} />
      </motion.button>
    </div>
  );
}
