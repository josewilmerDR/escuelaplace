import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/layout/BottomNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://escuelaplace.com"),
  title: {
    default: "escuelaplace — comercios que apoyan a las escuelas de Costa Rica",
    template: "%s | escuelaplace",
  },
  description:
    "Directorio comunitario que conecta comercios locales con escuelas de Costa Rica. Descubrí negocios que apoyan a la escuela de tu comunidad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) add attributes to <body> before hydration, which would
          otherwise log a hydration mismatch. Scoped to this node's attributes only. */}
      {/* pb-16 on mobile reserves room for the fixed BottomNav so it never covers the footer
          or trailing content; cleared from sm up, where the bar is hidden and nav lives in
          the header. */}
      <body
        className="min-h-full flex flex-col pb-16 sm:pb-0"
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
