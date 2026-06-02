"use client";

import type { HTMLAttributes } from "react";

import { cn } from "../lib/cn";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

// `success` / `danger` reuse the diff colors (green / red).
const toneClass: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-diff-added-surface text-diff-added",
  danger: "bg-diff-removed-surface text-diff-removed",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
};

/** Compact labelled status badge — used by the worker jobs UI and dashboards. */
export function StatusPill({
  tone = "neutral",
  className,
  ...props
}: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
