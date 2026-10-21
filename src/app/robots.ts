import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

/**
 * robots.txt (plan §4.5).
 *
 * Solo el catalogo publico es rastreable. El panel, el onboarding y los
 * endpoints de API no tienen nada que ver con un buscador.
 */
export default function robots(): MetadataRoute.Robots {
  const { NEXT_PUBLIC_APP_URL } = getEnv();
  const base = NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/s/",
        disallow: [
          "/panel",
          "/products",
          "/ajustes",
          "/categorias",
          "/etiquetas",
          "/onboarding",
          "/login",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
