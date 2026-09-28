"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { MemberData } from "@/components/settings/member-data";
import { AppShell } from "@/components/shell/app-shell";
import { useSession } from "@/lib/auth-client";
import { RealtimeProvider } from "@/realtime/realtime-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
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

  return (
    <RealtimeProvider>
      <MemberData />
      <AppShell
        user={{
          name: session?.user.name ?? session?.user.email ?? "",
          email: session?.user.email ?? "",
          avatarUrl: session?.user.image ?? null,
        }}
      >
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}
