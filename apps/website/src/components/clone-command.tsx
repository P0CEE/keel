"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "./icons";
import { cn } from "@keel/ui/cn";

const CLONE_PREFIX = "git clone ";
const CLONE_URL = "https://github.com/P0CEE/keel.git";
const CLONE_COMMAND = CLONE_PREFIX + CLONE_URL;
const COPIED_RESET_MS = 1600;

interface CloneCommandProps {
  copyLabel: string;
  copiedLabel: string;
}

/**
 * The hero's centerpiece: a terminal-style `git clone` command with a copy
 * button. The command is selectable; the button copies it and flips to a check
 * on success. On narrow screens the command scrolls horizontally (no visible
 * scrollbar) instead of wrapping.
 */
export function CloneCommand({ copyLabel, copiedLabel }: CloneCommandProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CLONE_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard API unavailable (e.g. an insecure context). Selecting the
      // command text still lets the visitor copy manually.
    }
  }

  return (
    <div className="group border-border bg-card hover:border-foreground/20 focus-within:border-foreground/20 flex h-12 w-full max-w-lg items-center gap-3 rounded-xl border pr-1.5 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_34px_-20px_rgba(0,0,0,0.30)] transition-colors">
      <code className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto font-mono text-sm whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span aria-hidden className="text-muted-foreground/70 select-none">
          $
        </span>
        <span className="text-foreground">
          {CLONE_PREFIX}
          <span className="text-muted-foreground">{CLONE_URL}</span>
        </span>
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? copiedLabel : copyLabel}
        className={cn(
          "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 active:scale-90",
          copied
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "bg-foreground text-background pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm transition-[opacity,transform] duration-200",
            copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          {copiedLabel}
        </span>
        <span className="relative inline-block size-4">
          <CopyIcon
            width={16}
            height={16}
            className={cn(
              "absolute inset-0 transition-all duration-200 ease-out motion-reduce:transition-none",
              copied ? "scale-50 opacity-0" : "scale-100 opacity-100",
            )}
          />
          <CheckIcon
            width={16}
            height={16}
            className={cn(
              "absolute inset-0 transition-all duration-200 ease-out motion-reduce:transition-none",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
        </span>
      </button>
    </div>
  );
}
