import type { Metadata } from "next";
import Link from "next/link";

import styles from "./status-page.module.css";
import { RamnnPicto } from "@keel/ui/brand/ramnn";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <RamnnPicto className={styles.mark} title="ramnn" />
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>
        The page you are looking for does not exist or has moved.
      </p>
      <Link href="/" className={styles.link}>
        Back to home
      </Link>
    </main>
  );
}
