/* eslint-disable @next/next/no-img-element -- next/og renderiza con <img>: next/image no aplica aquí */
import { ImageResponse } from "next/og";
import { getEnv } from "@/lib/env";
import { getOgProduct } from "@/lib/catalog";

/**
 * Imagen OG de la ficha de producto (plan §4.4, §6.2).
 *
 * 1200x630 con foto, nombre, precio y nombre de la tienda: es lo que se ve
 * en el preview de WhatsApp. Los datos vienen cacheados por tag del
 * producto, asi que la imagen no se regenera en cada preview.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Catálogo";

export default async function OgImage({
  params,
}: {
  params: Promise<{ store: string; product: string }>;
}) {
  const { store, product } = await params;
  const { NEXT_PUBLIC_APP_URL } = getEnv();

  const data = await getOgProduct(store, product, NEXT_PUBLIC_APP_URL);

  if (!data) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f4f4f5",
            color: "#52525b",
            fontSize: 48,
          }}
        >
          Catálogo no disponible
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 84,
            alignItems: "center",
            padding: "0 48px",
            background: "#18181b",
            color: "#ffffff",
            fontSize: 32,
            fontWeight: 600,
          }}
        >
          {data.storeName}
        </div>

        <div style={{ display: "flex", flex: 1 }}>
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt=""
              width={560}
              height={546}
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 560,
                height: 546,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f4f4f5",
                color: "#a1a1aa",
                fontSize: 120,
              }}
            >
              {data.productName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 48px",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                lineHeight: 1.15,
                color: "#18181b",
                display: "flex",
              }}
            >
              {data.productName}
            </div>
            {data.price ? (
              <div
                style={{
                  marginTop: 28,
                  fontSize: 60,
                  fontWeight: 700,
                  color: "#16a34a",
                  display: "flex",
                }}
              >
                {data.price}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
