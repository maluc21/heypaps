"use client";

/**
 * Catálogo: buscador y grid de productos.
 *
 * El buscador filtra sobre los productos ya cargados (el RPC público pagina, no
 * busca). Con el límite del plan free (30 productos) cubre el caso real; si
 * el catálogo crece, la búsqueda pasa al servidor.
 */

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/public/product-card";
import type { PublicProductCard } from "@/lib/catalog";

type Props = {
  storeSlug: string;
  products: PublicProductCard[];
  currency: string;
};

export function CatalogGrid({ storeSlug, products, currency }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.tag ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Este catálogo todavía no tiene productos publicados.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar producto…"
        aria-label="Buscar producto"
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin resultados para “{query.trim()}”.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              storeSlug={storeSlug}
              product={product}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
