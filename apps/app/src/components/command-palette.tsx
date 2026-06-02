"use client";

import {
  LayoutDashboard,
  ListTodo,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { signOut } from "@/lib/auth-client";
import { useScopedI18n } from "@/locales/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@keel/ui/command";

/**
 * Global command palette. Opens on ⌘K / Ctrl+K and offers fast access to
 * navigation, theme switching, and account actions — searched against the
 * already-mounted React tree, no network involved.
 *
 * Mount once at the dashboard layout level; both the trigger button and the
 * dialog live inside this component to keep state local.
 */
export function CommandPalette() {
  const t = useScopedI18n("command");
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  // Global hotkey. Capture both Cmd (macOS) and Ctrl (Windows/Linux) so the
  // shortcut works regardless of host OS without runtime UA sniffing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close the dialog before invoking the action so the route change or theme
  // swap doesn't fight the dialog's exit animation.
  const run = useCallback((action: () => void) => {
    setOpen(false);
    queueMicrotask(action);
  }, []);

  // Sign out and let the dashboard layout's session-watcher own the redirect
  // — that effect runs as soon as `useSession()` flips to a null session, so
  // we avoid racing the navigation with the cookie clear.
  async function handleSignOut() {
    await signOut();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("trigger_label")}
        className="border-border bg-background text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">{t("trigger_label")}</span>
        <kbd className="border-border bg-card text-muted-foreground ml-1 hidden h-5 items-center rounded border px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("trigger_label")}
        description={t("trigger_hint")}
      >
        <CommandInput placeholder={t("placeholder")} />
        <CommandList>
          <CommandEmpty>{t("empty")}</CommandEmpty>

          <CommandGroup heading={t("group_navigate")}>
            <CommandItem onSelect={() => run(() => router.push("/"))}>
              <LayoutDashboard />
              <span>{t("go_home")}</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/tasks"))}>
              <ListTodo />
              <span>{t("go_tasks")}</span>
              <CommandShortcut>G T</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/jobs"))}>
              <Workflow />
              <span>{t("go_jobs")}</span>
              <CommandShortcut>G J</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading={t("group_appearance")}>
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun />
              <span>{t("theme_light")}</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon />
              <span>{t("theme_dark")}</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor />
              <span>{t("theme_system")}</span>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading={t("group_account")}>
            <CommandItem
              onSelect={() =>
                run(() => {
                  handleSignOut().catch((error: unknown) => {
                    console.error("sign-out failed", error);
                  });
                })
              }
            >
              <LogOut />
              <span>{t("sign_out")}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
