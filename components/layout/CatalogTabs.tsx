import Link from "next/link";
import { communityEntityLabel } from "@/lib/community";

/**
 * The home's top-level section switch: "Escuelas" (the school directory at /) and "Comercios"
 * (the business catalog at /businesses). Two real routes, so each is crawlable; the active one
 * is passed in by the rendering page (no pathname hook needed — this stays a server component).
 * Mirrors <ProfileTabs>' visual language (underline on the active tab), centered.
 */
const TABS = [
  { key: "schools", href: "/", label: communityEntityLabel() },
  { key: "businesses", href: "/businesses", label: "Comercios" },
] as const;

export type CatalogTab = (typeof TABS)[number]["key"];

export function CatalogTabs({ active }: { active: CatalogTab }) {
  return (
    <nav
      aria-label="Secciones"
      className="flex justify-center gap-1 border-b border-border"
    >
      {TABS.map(({ key, href, label }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative px-5 py-3 text-sm font-semibold transition-colors ${
              isActive
                ? "text-brand-darker after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                : "text-muted hover:text-brand-darker"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
