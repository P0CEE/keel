"use client";

import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { ease } from "../../mint/motion";
import {
  CATEGORY_COLORS,
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import {
  CategoryGlyph,
  ICON_PICKER_GLYPHS,
  type IconPickerGlyph,
} from "../category-tag/category-glyphs";
import { cellOf, gridStep } from "./grid";
import styles from "./icon-picker.module.css";

// mint-pocs' Icon picker (src/demos/icon-picker/IconPicker.tsx): the tile
// that shows an icon in its colour over a wash of it, and, on click, a
// popover of 28 icons on a 7-column grid with the colours under them. Hover
// or focus the tile and the icon gives way to a pencil. Each grid is one
// radio group (one tab stop, arrows move and select, Home and End); the
// checked cell wears a ring, one element moved a whole cell at a time. The
// popover stays open while choosing; Esc, a click outside or the tile close
// it and give the focus back. Reduced motion: fades only, the rings jump.
//
// Adapted to keel: the colours are the categorical palette's roles
// (`--category-*`) plus the demo's Neutral, the ink itself; the colour row
// is optional, since a household subcategory takes its parent's colour; the
// icons are the category glyphs' art (one drawing per icon); every word is
// a prop.

export { ICON_PICKER_GLYPHS, type IconPickerGlyph };

export type PickerColor = "neutral" | CategoryColor;

/** Neutral, then the categorical palette in its order. */
export const PICKER_COLORS: readonly PickerColor[] = [
  "neutral",
  ...CATEGORY_COLORS,
];

export type IconChoice = {
  readonly icon: IconPickerGlyph;
  readonly color: PickerColor;
};

export type IconPickerLabels = {
  /** The tile's name: what it styles, the current icon and colour, "change". */
  readonly tile: (icon: string, color: string | null) => string;
  /** The popover's heading, read out only ("Icon and colour of Groceries"). */
  readonly title: string;
  /** The icons' group ("Icon"). */
  readonly icons: string;
  /** The colours' group ("Colour"), when there is a colour row. */
  readonly colors?: string;
  readonly iconNames: Readonly<Record<IconPickerGlyph, string>>;
  readonly colorNames?: Readonly<Partial<Record<PickerColor, string>>>;
};

export type IconPickerProps = {
  readonly value?: IconChoice;
  readonly defaultValue?: IconChoice;
  readonly onChange?: (value: IconChoice) => void;
  /** The colours offered; absent, no colour row (the tile keeps its colour). */
  readonly colors?: readonly PickerColor[];
  readonly labels: IconPickerLabels;
  /** Opens the popover from outside. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

const DEFAULT_CHOICE: IconChoice = { icon: "bag", color: "orange" };

function tone(color: PickerColor): string {
  return color === "neutral" ? "var(--ink)" : categoryVar(color);
}

const PENCIL = (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5L21.2 6.8Z" />
    <path d="M15 5l4 4" />
  </svg>
);

export function IconPicker({
  value,
  defaultValue = DEFAULT_CHOICE,
  onChange,
  colors,
  labels,
  open: openProp,
  onOpenChange,
}: IconPickerProps) {
  const reduce = useReducedMotion() ?? false;
  const [own, setOwn] = useState(defaultValue);
  const choice = value ?? own;
  const choose = (next: IconChoice) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const layer = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const iconName = labels.iconNames[choice.icon];
  const colorName =
    colors === undefined ? null : (labels.colorNames?.[choice.color] ?? null);

  return (
    <div
      className={styles.picker}
      style={{ "--tone": tone(choice.color) } as CSSProperties}
    >
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOwnOpen(next);
          onOpenChange?.(next);
        }}
      >
        <Popover.Trigger
          className={styles.tile}
          aria-label={labels.tile(iconName, colorName)}
        >
          {/* The icon and the pencil share one cell; the icon cross-fades
              inside a layer of its own that the hover fades (motion owns the
              icon's opacity inline). */}
          <span className={styles.tileArt} aria-hidden="true">
            <span className={styles.tileCurrent}>
              <AnimatePresence initial={false}>
                <motion.span
                  key={choice.icon}
                  className={styles.tileIcon}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.7, filter: "blur(4px)" }
                  }
                  animate={{
                    opacity: 1,
                    scale: 1,
                    filter: "blur(0px)",
                    transitionEnd: { filter: "none" },
                  }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.7, filter: "blur(4px)" }
                  }
                  transition={{ duration: 0.22, ease: ease.enter }}
                >
                  <CategoryGlyph
                    name={choice.icon}
                    size={24}
                    strokeWidth={1.75}
                  />
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={styles.tileEdit}>{PENCIL}</span>
          </span>
        </Popover.Trigger>
        <Popover.Portal container={layer}>
          <Popover.Positioner
            className={styles.positioner}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            positionMethod="fixed"
          >
            <Popover.Popup
              ref={panel}
              className={styles.panel}
              aria-labelledby={titleId}
              initialFocus={() =>
                panel.current?.querySelector<HTMLElement>(
                  '[aria-checked="true"]',
                ) ?? true
              }
            >
              <h2 id={titleId} className={styles.sr}>
                {labels.title}
              </h2>
              <RadioGrid
                label={labels.icons}
                variant="icons"
                items={ICON_PICKER_GLYPHS}
                value={choice.icon}
                name={(icon) => labels.iconNames[icon]}
                onChange={(icon) => choose({ ...choice, icon })}
                render={(icon) => (
                  <CategoryGlyph name={icon} size={28} strokeWidth={1.75} />
                )}
              />
              {colors === undefined ? null : (
                <>
                  <div className={styles.rule} role="separator" />
                  <RadioGrid
                    label={labels.colors ?? ""}
                    variant="colors"
                    items={colors}
                    value={choice.color}
                    name={(color) => labels.colorNames?.[color] ?? color}
                    onChange={(color) => choose({ ...choice, color })}
                    render={(color) => (
                      <span
                        className={styles.swatch}
                        style={{ "--tone": tone(color) } as CSSProperties}
                      />
                    )}
                  />
                </>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <div ref={layer} className={styles.layer} />
    </div>
  );
}

type RadioGridProps<T extends string> = {
  readonly label: string;
  readonly variant: "icons" | "colors";
  readonly items: readonly T[];
  readonly value: T;
  readonly name: (item: T) => string;
  readonly onChange: (item: T) => void;
  readonly render: (item: T) => ReactNode;
};

/**
 * A radio group on the 7-column grid: one tab stop, the arrow keys moving
 * (and selecting) through it; its ring is one element translated to the
 * checked cell, so its geometry is the grid's own and nothing is measured.
 */
function RadioGrid<T extends string>({
  label,
  variant,
  items,
  value,
  name,
  onChange,
  render,
}: RadioGridProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(items.indexOf(value), 0);
  const { col, row } = cellOf(index);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = gridStep(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (item !== undefined) onChange(item);
    buttons.current[next]?.focus();
  };
  return (
    <div
      className={styles.grid}
      data-variant={variant}
      role="radiogroup"
      aria-label={label}
    >
      <span
        className={styles.ring}
        aria-hidden="true"
        style={{ "--col": col, "--row": row } as CSSProperties}
      />
      {items.map((item, i) => (
        <button
          key={item}
          ref={(element) => {
            buttons.current[i] = element;
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={name(item)}
          tabIndex={i === index ? 0 : -1}
          className={styles.cell}
          onClick={() => onChange(item)}
          onKeyDown={onKeyDown}
        >
          {render(item)}
        </button>
      ))}
    </div>
  );
}
