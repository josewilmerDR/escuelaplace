import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";

/**
 * The standard "back" link at the bottom (or top) of a page. Replaces the bare "← …" text
 * glyph with a real SVG arrow and keeps one consistent treatment everywhere. Inherits the
 * surrounding font size; wrap it in the page's own spacing container.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-muted hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}
