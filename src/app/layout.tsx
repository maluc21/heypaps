import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getEnv } from "@/lib/env";

// Tipografías del branding (tema tweakcn): se auto-alojan con next/font bajo
// /_next/static/media, permitido por la CSP (font-src 'self' data:).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
