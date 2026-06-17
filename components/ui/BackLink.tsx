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
      // min-h-10 + the -mx-1/px-1 pad give a comfortable touch target without shifting the
      // visual position (the negative margin absorbs the padding).
      className="-mx-1 inline-flex min-h-10 items-center gap-1.5 px-1 text-muted hover:text-foreground hover:underline active:text-foreground"
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}
