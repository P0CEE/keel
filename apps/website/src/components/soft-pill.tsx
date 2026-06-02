import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@keel/ui/cn";

type SoftPillVariant = "primary" | "secondary";

/**
 * Class string for a rounded "soft pill": blurred translucent surface, hairline
 * ring and a low, layered shadow. Exposed so anchors (`<a>`) can reuse the look
 * without nesting a `<button>`. Uses keel tokens, so it tracks the theme.
 */
export function softPillClasses(
  variant: SoftPillVariant = "secondary",
  className?: string,
): string {
  return cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium leading-none tracking-tight backdrop-blur transition-[transform,background-color,opacity] duration-150 active:scale-[0.98]",
    variant === "primary"
      ? "bg-primary text-primary-foreground ring-1 ring-black/10 hover:opacity-90 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.30),0_1px_2px_rgba(0,0,0,0.12)]"
      : "bg-card/80 text-foreground ring-1 ring-border hover:bg-card shadow-[0_4px_14px_-6px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.06)]",
    className,
  );
}

interface SoftPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SoftPillVariant;
  children: ReactNode;
}

export function SoftPill({
  className,
  variant = "secondary",
  children,
  ...props
}: SoftPillProps) {
  return (
    <button className={softPillClasses(variant, className)} {...props}>
      {children}
    </button>
  );
}
