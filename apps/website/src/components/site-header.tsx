"use client";

import Link from "next/link";

import { GithubIcon } from "./icons";
import { Logo } from "./logo";
import { softPillClasses } from "./soft-pill";
import { useScopedI18n } from "@/locales/client";

const REPO_URL = "https://github.com/P0CEE/keel";

export function SiteHeader() {
  const t = useScopedI18n("home");

  return (
    <header className="relative z-10 flex w-full items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" aria-label="keel" className="flex items-center">
        <Logo />
      </Link>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={softPillClasses("secondary")}
      >
        <GithubIcon width={14} height={14} />
        {t("starGithub")}
      </a>
    </header>
  );
}
