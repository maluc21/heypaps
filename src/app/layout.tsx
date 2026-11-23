import type { Metadata } from "next";
import { connection } from "next/server";
import { Fredoka, Geist_Mono, Google_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getEnv } from "@/lib/env";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--display-family",
});

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: "variable",
  variable: "--text-family",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Catálogo SaaS",
  description: "Catálogos digitales para microemprendedores",
  // Base por defecto para resolver URLs absolutas de OG. Las páginas del
  // catálogo público lo sobrescriben con su canonical por subdominio.
  metadataBase: new URL(getEnv().NEXT_PUBLIC_APP_URL),
};

export const instant = false;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render dinámico por petición: el nonce de la CSP (proxy.ts) solo existe en cada request.
  await connection();
  return (
    <html
      lang="es"
      className={`${fredoka.variable} ${googleSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
