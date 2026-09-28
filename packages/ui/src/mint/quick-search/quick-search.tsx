"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { SearchIcon } from "../icons/icons";
import styles from "./quick-search.module.css";
import { moveActive, rankItems, type Searchable } from "./rank";

export type SearchItem = Searchable & {
  /** A 24px mark: a merchant logo, or a glyph. */
  readonly icon: ReactNode;
  /** What it is, in the tertiary ink ("Page", "Apparence"). */
  readonly detail?: string;
  /** A badge at the end: a key, a market, an account. */
  readonly meta?: string;
  readonly onSelect: () => void;
};

export type QuickSearchLabels = {
  readonly placeholder: string;
  readonly suggested: string;
  readonly results: string;
  /** The empty state's title, from the query ("Aucun résultat pour « x »"). */
  readonly empty: (query: string) => string;
  readonly emptyHint: string;
  readonly close: string;
};

export type QuickSearchProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly items: readonly SearchItem[];
  readonly labels: QuickSearchLabels;
  /** Cmd+K / Ctrl+K opens it from anywhere ("/" belongs to the shortcut table). */
  readonly commandKey?: boolean;
};

const ROWS = 6; // the list's height, in rows: the suggestions, exactly
const ROW = 48;

/**
 * The search palette, mint-pocs' quick search: a large field over the page,
 * the page behind blurred and dimmed, suggestions when empty, matches as
 * one types, the arrows walk them, Enter runs one. The list keeps its height
 * and scrolls, its edges fading where more rows wait.
 */
export function QuickSearch({
  open,
  onOpenChange,
  items,
  labels,
  commandKey = true,
}: QuickSearchProps) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      open ||
      event.key.toLowerCase() !== "k" ||
      !(event.metaKey || event.ctrlKey)
    )
      return;
    event.preventDefault();
    onOpenChange(true);
  });
  useEffect(() => {
    if (!commandKey) return;
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [commandKey]);

  return (
    // the page is not scroll-locked: the lock took the scrollbar's room and moved the page
    <Dialog.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      modal="trap-focus"
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.scrim} />
        <Dialog.Popup
          className={styles.panel}
          aria-label={labels.placeholder}
          finalFocus={false}
        >
          {/* a way out for touch screen readers, which have no Esc */}
          <Dialog.Close className={styles.srOnly}>{labels.close}</Dialog.Close>
          <Palette
            items={items}
            labels={labels}
            onPick={(item) => {
              onOpenChange(false);
              item.onSelect();
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// The field and the list; mounted each time the palette opens, so it starts empty.
function Palette({
  items,
  labels,
  onPick,
}: {
  readonly items: readonly SearchItem[];
  readonly labels: QuickSearchLabels;
  readonly onPick: (item: SearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => rankItems(query, items, ROWS), [query, items]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const rowId = (index: number) => `${listId}-${index}`;

  // a new text starts the choice over, at the best match
  const [shownFor, setShownFor] = useState(query);
  if (shownFor !== query) {
    setShownFor(query);
    setActive(0);
  }

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  // the active row stays in view by scrolling the list alone: scrollIntoView
  // would scroll every ancestor too
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector(`[id="${rowId(active)}"]`);
    if (!box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const parsed = Number.parseFloat(getComputedStyle(box).scrollPaddingTop);
    const pad = Number.isFinite(parsed) ? parsed : 0;
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    else if (r.bottom > b.bottom - pad)
      box.scrollTop += r.bottom - (b.bottom - pad);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // an edge with more rows past it fades: the scrollbar is hidden
  const [more, setMore] = useState({ above: false, below: false });
  const measure = () => {
    const element = list.current;
    if (!element) return;
    const above = element.scrollTop > 1;
    const below =
      element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    setMore((current) =>
      current.above === above && current.below === below
        ? current
        : { above, below },
    );
  };
  useEffect(measure, [results]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        moveActive(event.key as "ArrowDown" | "ArrowUp", index, results.length),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[active];
      if (item) onPick(item);
    }
  };

  const typing = query.trim() !== "";
  return (
    <>
      <label className={styles.field}>
        <SearchIcon size={22} />
        <input
          ref={input}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? rowId(active) : undefined}
          aria-label={labels.placeholder}
          placeholder={labels.placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className={styles.section} aria-hidden>
        {typing ? labels.results : labels.suggested}
        {typing && results.length > ROWS ? (
          <span className={styles.count}>{results.length}</span>
        ) : null}
      </div>
      <div
        ref={list}
        id={listId}
        className={styles.list}
        role="listbox"
        aria-label={typing ? labels.results : labels.suggested}
        data-more-above={more.above ? true : undefined}
        data-more-below={more.below ? true : undefined}
        onScroll={measure}
        style={{ height: ROWS * ROW + 8 }}
      >
        {results.map((item, index) => (
          <div
            key={item.id}
            id={rowId(index)}
            className={styles.row}
            role="option"
            aria-selected={index === active}
            data-active={index === active ? true : undefined}
            onPointerMove={() => {
              if (index !== active) setActive(index);
            }}
            onClick={() => onPick(item)}
          >
            <span className={styles.mark}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.detail}>{item.detail}</span>
            {item.meta ? (
              <span className={styles.meta}>{item.meta}</span>
            ) : null}
          </div>
        ))}
        {results.length === 0 ? (
          <div className={styles.empty} role="status">
            <span className={styles.emptyTitle}>
              {labels.empty(query.trim())}
            </span>
            <span className={styles.emptyText}>{labels.emptyHint}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
