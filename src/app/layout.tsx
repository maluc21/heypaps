import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getEnv } from "@/lib/env";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
