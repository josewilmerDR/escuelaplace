import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/layout/BottomNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getCurrentCommunity } from "@/lib/community";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The active community (escuelaplace today) supplies brand/identity; see lib/community.
const community = getCurrentCommunity();

export const metadata: Metadata = {
  // Absolute base for OG/canonical URLs. Must be the origin the site is actually served from
  // (see SITE_URL) so link-preview scrapers can fetch og:image — a hardcoded not-yet-live
  // domain breaks every share preview.
  metadataBase: new URL(SITE_URL),
  title: {
    default: community.copy.metaTitle,
    template: `%s | ${community.brandName}`,
  },
  description: community.copy.metaDescription,
};

// Mobile viewport config. `viewportFit: "cover"` is the prerequisite that makes
// `env(safe-area-inset-*)` resolve to non-zero on notched phones — without it the
// BottomNav's bottom-inset padding (and the body reservation below) is a silent no-op
// and the bar sits under the iOS home indicator. `themeColor` tints the mobile browser
// status bar to match the sticky brand header (--brand-dark / sky-600) so the chrome
// reads as an app, not a web page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: community.colors.brandDark,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={community.locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) add attributes to <body> before hydration, which would
          otherwise log a hydration mismatch. Scoped to this node's attributes only. */}
      {/* On mobile, reserve room for the fixed BottomNav so it never covers the footer or
          trailing content. The bar is 64px (4rem) tall PLUS its bottom safe-area inset, so the
          reservation must track the same inset — a flat pb-16 would leave content hidden under
          the taller bar on notched phones once viewport-fit:cover is on. Cleared from sm up,
          where the bar is hidden and nav lives in the header. */}
      <body
        className="min-h-full flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
        suppressHydrationWarning
      >
        {/* Skip link (WCAG 2.4.1 Bypass Blocks): the first focusable element, visually
            hidden until focused. Lets keyboard/screen-reader users jump past the sticky
            header — search + browse chips + account actions, repeated on every page —
            straight to the page content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-darker focus:shadow-lg focus:ring-2 focus:ring-brand"
        >
          Saltar al contenido
        </a>
        {/* The brand header is part of the app shell: rendered once here so every
            route — the public catalog and the private panel alike — shares it,
            instead of each page importing and rendering <SiteHeader /> on its own. */}
        <AuthProvider>
          <SiteHeader />
          {/* Skip-link target + content wrapper. Each page renders its own <main> landmark;
              this stable id/tabIndex gives the skip link one focus target across every route
              (public, panel, home, 404) without threading an id through every page's <main>.
              A plain block wrapper — no flex classes — so the existing layout is unchanged. */}
          <div id="main" tabIndex={-1} className="outline-none">
            {children}
          </div>
          <SiteFooter />
          {/* Mobile-only bottom navigation; on desktop these destinations live in the
              header's browse cluster (see HeaderBrowse / BottomNav). */}
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
