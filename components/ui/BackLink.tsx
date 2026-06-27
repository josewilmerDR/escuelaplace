import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";

const CLASS =
  "inline-flex items-center gap-1.5 text-muted hover:text-foreground hover:underline";

/**
 * The standard "back" link at the bottom (or top) of a page. Replaces the bare "← …" text
 * glyph with a real SVG arrow and keeps one consistent treatment everywhere. Inherits the
 * surrounding font size; wrap it in the page's own spacing container.
 *
 * Pass `href` for a fixed destination, or `onClick` (no href) to render a button — used when
 * the page can be reached several ways and "back" should return to wherever the user came from.
 */
export function BackLink({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className={CLASS}>
        <ArrowLeftIcon className="h-4 w-4 shrink-0" />
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={CLASS}>
      <ArrowLeftIcon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}
