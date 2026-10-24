import type { NextConfig } from "next";

// La CSP se genera por petición con nonce en src/proxy.ts. No definir una CSP estática
// aquí: dos cabeceras CSP se aplican a la vez y la estática no tendría nonce.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // La optimización la hace ImageKit, no Vercel: el original nunca pasa por
    // el optimizador de Next y no se cobra Compute (plan §6.2).
    loader: "custom",
    loaderFile: "./src/lib/imagekit-loader.ts",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
