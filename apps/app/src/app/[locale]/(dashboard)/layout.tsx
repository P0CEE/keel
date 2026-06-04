"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { CommandPalette } from "@/components/command-palette";
import { KeelMark } from "@/components/keel-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut, useSession } from "@/lib/auth-client";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const t = useScopedI18n("nav");
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  // Client-side guard: redirect once the session resolves to null (forged
  // cookie, or post-signOut). The proxy only checks cookie presence; the API
  // is the authoritative boundary.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (!isPending && !session) {
    return null;
  }

  const navItems = [
    { href: "/tasks", label: t("tasks") },
    { href: "/jobs", label: t("jobs") },
  ];

  // The session-watcher above owns the redirect — calling signOut() is
  // enough; once the session becomes null the effect navigates to /login.
  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-6 px-6">
          <Link href="/tasks" className="flex items-center gap-2">
            <KeelMark size={22} className="text-primary" />
            <span className="text-sm font-semibold tracking-tight">keel</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "text-foreground rounded-md px-2.5 py-1.5 font-medium"
                      : "text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            {session?.user.email ? (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {session.user.email}
              </span>
            ) : null}
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleSignOut().catch((error: unknown) => {
                  console.error("sign-out failed", error);
                });
              }}
            >
              {t("sign_out")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
