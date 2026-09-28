"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
  useId,
} from "react";

import { joinIds } from "../aria";
import { ChevronDownIcon } from "../icons/icons";
import styles from "./select.module.css";

// mint-pocs' Select (src/demos/select/SelectDemo.tsx): Base UI's Select in
// Mint's dress, the 52px field trigger whose label floats once a value is
// picked, the chevron that flips, the frosted popup that unfolds from the
// trigger and the ring-and-dot options. Keyboard, typeahead and ARIA come
// from Base UI.

export type SelectProps = BaseSelect.Root.Props<string, false>;

// modal={false} in use keeps the page scrollable and interactive while the
// popup is open, as the demo does.
function SelectRoot(props: SelectProps) {
  return <BaseSelect.Root {...props} />;
}

export type SelectTriggerProps = Omit<
  BaseSelect.Trigger.Props,
  "ref" | "className"
> & {
  readonly ref?: Ref<HTMLButtonElement>;
  /** The floating label. */
  readonly label?: ReactNode;
  /** Whether the field holds a value: the label floats (ours, not Base UI's, the amount input's rule). */
  readonly filled?: boolean;
};

// The 52px text-field box: border, focus stroke, hover.
function SelectTrigger({
  ref,
  children,
  label,
  filled = false,
  ...rest
}: SelectTriggerProps) {
  const labelId = useId();
  const hasLabel = label !== undefined;
  // The field is named by its visible label, alongside any caller labelling.
  const labelledBy = hasLabel
    ? joinIds(labelId, rest["aria-labelledby"])
    : rest["aria-labelledby"];
  return (
    <BaseSelect.Trigger
      ref={ref}
      className={
        hasLabel && filled
          ? `${styles.trigger} ${styles.floated}`
          : styles.trigger
      }
      {...rest}
      aria-labelledby={labelledBy}
    >
      {hasLabel ? (
        <span
          id={labelId}
          className={
            filled ? `${styles.label} ${styles.floated}` : styles.label
          }
          data-floated={filled ? true : undefined}
        >
          {label}
        </span>
      ) : null}
      {children}
    </BaseSelect.Trigger>
  );
}

function SelectValue(props: BaseSelect.Value.Props) {
  return <BaseSelect.Value {...props} />;
}

// The chevron flips while the popup is open.
function SelectIcon() {
  return (
    <BaseSelect.Icon className={styles.chevron}>
      <ChevronDownIcon size={12} />
    </BaseSelect.Icon>
  );
}

export type SelectContentProps = Omit<
  BaseSelect.Popup.Props,
  "ref" | "className"
> & {
  /** Lines the list up with the field trigger (Base UI's --anchor-width). */
  readonly matchTriggerWidth?: boolean;
  readonly positionMethod?: BaseSelect.Positioner.Props["positionMethod"];
  readonly collisionAvoidance?: BaseSelect.Positioner.Props["collisionAvoidance"];
  /** Where the popup is portalled: <body> by default, or a SelectAnchor. */
  readonly container?: BaseSelect.Portal.Props["container"];
};

function SelectContent({
  children,
  matchTriggerWidth = false,
  container,
  positionMethod,
  collisionAvoidance,
  onClick,
  ...rest
}: SelectContentProps) {
  return (
    <BaseSelect.Portal container={container}>
      {/* alignItemWithTrigger off: Mint's popup drops below the field rather
          than overlaying it with the selected row on the value. */}
      <BaseSelect.Positioner
        className={styles.positioner}
        side="bottom"
        align="start"
        sideOffset={6}
        alignItemWithTrigger={false}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
      >
        <BaseSelect.Popup
          className={
            matchTriggerWidth
              ? `${styles.popup} ${styles.matched}`
              : styles.popup
          }
          // A click inside the popup must not reach whatever the trigger sits in.
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(event);
          }}
          {...rest}
        >
          <BaseSelect.List>{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

// Each option: its label, then the ring-and-dot indicator. The indicator
// stays mounted whether or not the row is selected: the ring is the
// affordance, the dot inside it is what appears.
function SelectItem({
  children,
  ...rest
}: Omit<BaseSelect.Item.Props, "className">) {
  return (
    <BaseSelect.Item className={styles.item} {...rest}>
      <div className={styles.itemRow}>
        <div className={styles.itemCopy}>
          <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
        </div>
      </div>
      <BaseSelect.ItemIndicator
        keepMounted
        render={<div className={styles.indicator} />}
      >
        <span className={styles.dot} />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

/**
 * The Select: `<Select value onValueChange items>` around a
 * `<Select.Trigger label filled>` holding `<Select.Value />` and
 * `<Select.Icon />`, and a `<Select.Content>` of `<Select.Item value>`.
 */
export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: SelectIcon,
  Content: SelectContent,
  Item: SelectItem,
});

export type SelectAnchorProps = ComponentPropsWithoutRef<"div"> & {
  readonly ref?: Ref<HTMLDivElement>;
  readonly width?: number | string;
};

/**
 * A box the popup can be portalled into (`<Select.Content container>`)
 * rather than the document, so it stays inside the surrounding layout; it
 * is the positioning context, hence `position: relative`.
 */
export function SelectAnchor({
  ref,
  width,
  style,
  ...rest
}: SelectAnchorProps) {
  return (
    <div
      ref={ref}
      className={styles.anchor}
      style={{ width, ...style }}
      {...rest}
    />
  );
}
