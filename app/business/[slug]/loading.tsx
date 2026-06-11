import { SiteHeader } from "@/components/layout/SiteHeader";

/**
 * Route-level skeleton: without it, clicking a card freezes the current page until the
 * profile's SSR Firestore reads finish. Mirrors the page's layout (cover, title, meta,
 * contact buttons) so the real content replaces it without jumping.
 */
export default function LoadingBusinessPage() {
  return (
    <>
      <SiteHeader />

      <main aria-busy className="mx-auto max-w-3xl px-6 py-10">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-brand-tint" />
        <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="mt-6 flex gap-3">
          <div className="h-10 w-56 animate-pulse rounded-md bg-slate-200" />
          <div className="h-10 w-28 animate-pulse rounded-md bg-slate-100" />
        </div>
      </main>
    </>
  );
}
