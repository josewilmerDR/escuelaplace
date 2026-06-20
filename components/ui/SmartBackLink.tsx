"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";

/**
 * A "back" link that returns to the LAST page the user came from when there is in-app history
 * to go back to, and otherwise navigates to `fallbackHref` (e.g. a deep link or fresh tab,
 * where router.back() would leave the app or do nothing). It renders as a real <Link> to the
 * fallback — so SEO, middle-click and "open in new tab" all work — and intercepts a plain
 * left-click to prefer history.back().
 *
 * Mirrors BackLink's look (arrow + muted text); use it where the natural target is "wherever
 * the user was", not a fixed route.
 */
export function SmartBackLink({
  fallbackHref,
  children,
}: {
  fallbackHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (new tab/window) and non-left buttons.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    // history.length > 1 means there's an entry to step back to; otherwise the <Link> takes
    // over and lands on the sensible fallback.
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };

  return (
    <Link
      href={fallbackHref}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-muted hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}
