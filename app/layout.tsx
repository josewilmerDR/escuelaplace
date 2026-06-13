import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
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
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* The brand header is part of the app shell: rendered once here so every
            route — the public catalog and the private panel alike — shares it,
            instead of each page importing and rendering <SiteHeader /> on its own. */}
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
