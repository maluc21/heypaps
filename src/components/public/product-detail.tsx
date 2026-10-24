"use client";

/**
 * Ficha de producto: galería, selector de variantes y CTA de WhatsApp.
 *
 * Reglas de precio (plan §4.4): si todas las variantes activas cuestan lo
 * mismo, se muestra el precio simple; si difieren, "desde $X" (el mínimo).
 * El botón queda deshabilitado cuando la variante elegida está agotada.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/utils";
import {
  buildProductMessage,
  formatVariantAttributes,
} from "@/lib/whatsapp";
import { WhatsAppButton } from "@/components/public/whatsapp-button";
import type { PublicProduct, PublicVariant } from "@/lib/catalog";

const colorMap: Record<string, string> = {
  Negro: "#000000",
  Blanco: "#FFFFFF",
  Rojo: "#FF0000",
  Azul: "#0000FF",
  Verde: "#008000",
  Amarillo: "#FFFF00",
  Gris: "#808080",
  Rosa: "#FFC0CB",
  Naranja: "#FFA500",
  Morado: "#800080",
};

function ProductPlaceholder({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-3xl font-semibold text-muted-foreground">
      {initials || "?"}
    </div>
  );
}

/** Etiquetas disponibles de un atributo (Talle: S/M/L). */
function attributeNames(variants: PublicVariant[]): string[] {
  const names = new Set<string>();
  for (const v of variants) {
    for (const key of Object.keys(v.attributes ?? {})) names.add(key);
  }
  return [...names];
}

function valueFor(variant: PublicVariant, name: string): string | undefined {
  return variant.attributes?.[name];
}

function isSoldOut(variant: PublicVariant): boolean {
  return variant.stock !== null && variant.stock <= 0;
}

type Props = {
  store: { name: string; whatsapp: string | null; currency: string };
  storeId: string;
  product: PublicProduct;
  productUrl: string;
};

export function ProductDetail({ store, storeId, product, productUrl }: Props) {
  const variants = product.variants;
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? variants[0] ?? null,
    [variants, selectedId],
  );

  // "desde $X" solo si las variantes activas difieren en precio (plan §4.4).
  const isRange = useMemo(() => {
    const prices = new Set(variants.map((v) => v.final_price_cents));
    return prices.size > 1;
  }, [variants]);

  const priceFrom = product.price_from;
  const selectedPrice = selected ? selected.final_price_cents : priceFrom;

  const gallery = product.images.length > 0 ? product.images : [];
  const [activeImage, setActiveImage] = useState(0);

  const names = attributeNames(variants);

  const message = buildProductMessage({
    storeName: store.name,
    productName: product.name,
    variantAttributes: selected?.attributes ?? null,
    price: selectedPrice !== null ? formatMoney(selectedPrice, store.currency) : null,
    productUrl,
  });

  const soldOut = selected ? isSoldOut(selected) : false;
  const canOrder = Boolean(store.whatsapp) && !soldOut;

  return (
    <div className="space-y-6">
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
          {gallery[activeImage] ? (
            <Image
              src={gallery[activeImage]}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-cover"
              priority
            />
          ) : (
            <ProductPlaceholder name={product.name} />
          )}
        </div>
        {gallery.length > 1 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {gallery.map((image, i) => (
              <button
                key={image}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === activeImage}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                  i === activeImage ? "border-foreground" : "border-transparent"
                }`}
              >
                <Image src={image} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h1 className="text-xl font-semibold leading-tight">{product.name}</h1>

        {priceFrom !== null ? (
          <p className="text-2xl font-bold">
            {isRange ? "desde " : ""}
            {formatMoney(priceFrom, store.currency)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Consultar precio</p>
        )}

        {product.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        ) : null}
      </div>

      {names.length > 0 ? (
        <div className="space-y-4 rounded-xl border border-border p-4">
          {names.map((name) => {
            const values = [
              ...new Set(
                variants
                  .map((v) => valueFor(v, name))
                  .filter((v): v is string => Boolean(v)),
              ),
            ];
            return (
              <div key={name} className="space-y-2">
                <p className="text-sm font-medium">{name}</p>
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const match = variants.find(
                      (v) =>
                        valueFor(v, name) === value &&
                        (!selected || valueFor(selected, name) === value),
                    );
                    const candidate = variants.find((v) => valueFor(v, name) === value);
                    const isSelected = selected ? valueFor(selected, name) === value : false;
                    const unavailable = candidate ? isSoldOut(candidate) : false;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => match && setSelectedId(match.id)}
                        disabled={unavailable}
                        aria-pressed={isSelected}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {name.toLowerCase() === "color" && colorMap[value] ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: colorMap[value] }}
                            />
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {selected ? (
            <p className="text-xs text-muted-foreground">
              {formatVariantAttributes(selected.attributes) || "Sin variantes"}
              {" · "}
              {selected.stock === null
                ? "Por encargo"
                : selected.stock > 0
                  ? `${selected.stock} disponible(s)`
                  : "Agotado"}
            </p>
          ) : null}
        </div>
      ) : null}

      {canOrder ? (
        <WhatsAppButton
          phone={store.whatsapp!}
          message={message}
          storeId={storeId}
          productId={product.id}
          label="Pedir por WhatsApp"
          className="flex w-full items-center justify-center rounded-lg bg-[#25D366] px-4 py-3.5 text-base font-semibold text-white"
        />
      ) : (
        <p
          className="rounded-lg border border-border px-4 py-3.5 text-center text-sm text-muted-foreground"
          role="status"
        >
          {soldOut ? "Agotado por ahora" : "La tienda no tiene WhatsApp configurado"}
        </p>
      )}
    </div>
  );
}
