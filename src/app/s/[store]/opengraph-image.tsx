/* eslint-disable @next/next/no-img-element -- next/og renderiza con <img>: next/image no aplica aquí */
import { ImageResponse } from "next/og";
import { getEnv } from "@/lib/env";
import { getOgStore } from "@/lib/catalog";

/**
 * Imagen OG del catalogo de una tienda (plan §4.4, §7).
 *
 * Es la vista previa que se ve al compartir el link del catalogo.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Catálogo";

export default async function OgImage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const { store } = await params;
  const { NEXT_PUBLIC_APP_URL } = getEnv();

  const data = await getOgStore(store, NEXT_PUBLIC_APP_URL);

  const storeName = data?.storeName ?? "Catálogo";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "#ffffff",
          fontFamily: "sans-serif",
          flexDirection: "column",
        }}
      >
        {data?.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            width={140}
            height={140}
            style={{ objectFit: "cover", borderRadius: 28, marginBottom: 32 }}
          />
        ) : null}
        <div style={{ fontSize: 72, fontWeight: 700, display: "flex" }}>{storeName}</div>
        <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 16, display: "flex" }}>
          Catálogo de productos
        </div>
      </div>
    ),
    { ...size },
  );
}
