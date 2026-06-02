import type { Metadata } from "next";
import Link from "next/link";

import { KeelMark } from "@/components/keel-mark";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <KeelMark size={32} className="text-primary" />
      <h1 className="text-foreground mt-8 text-3xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-3">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-8 rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}
