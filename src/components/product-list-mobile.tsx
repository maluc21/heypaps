"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import { Barcode, Boxes, Edit, ExternalLink, Plus, Search } from "lucide-react";

type FilterOption = {
  id: string;
  name: string;
};

type StatusFilter = "all" | "visible" | "hidden" | "paused";

type Variant = {
  sku: string | null;
  stock: number | null;
  stock_unit: string | null;
  active: boolean;
  final_price_cents: number;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number | null;
  active: boolean;
  paused: boolean;
  category_id: string | null;
  tag_id: string | null;
  variants: Variant[];
};

export function ProductListMobile({
  products,
  categories,
  tags,
  currency,
  storeSlug,
}: {
  products: Product[];
  categories: FilterOption[];
  tags: FilterOption[];
  currency: string;
  storeSlug: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    return products.filter((product) => {
      if (searchTerm) {
        const searchableText = `${product.name} ${product.description ?? ""} ${
          product.slug
        }`.toLowerCase();
        if (!searchableText.includes(searchTerm)) return false;
      }
      if (categoryId && product.category_id !== categoryId) return false;
      if (tagId && product.tag_id !== tagId) return false;
      if (status === "visible" && !product.active) return false;
      if (status === "hidden" && product.active) return false;
      if (status === "paused" && !product.paused) return false;
      return true;
    });
  }, [products, query, categoryId, tagId, status]);

  const hasFilters =
    query.trim() !== "" || categoryId !== "" || tagId !== "" || status !== "all";

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          No hay productos aún.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Productos</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={filtersOpen ? "Ocultar búsqueda y filtros" : "Mostrar búsqueda y filtros"}
            aria-expanded={filtersOpen}
            aria-controls="mobile-product-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Search aria-hidden="true" />
          </Button>
          <Button
            render={<Link href="/products/nuevo" />}
            size="icon"
            aria-label="Nuevo producto"
            title="Nuevo producto"
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div id="mobile-product-filters" hidden={!filtersOpen} className="space-y-3">
        <Input
          id="mobile-product-search"
          className="h-11 w-full min-w-0"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar productos…"
          aria-label="Buscar productos"
        />
        <div className="grid min-w-0 grid-cols-1 gap-3">
          <label className="min-w-0 space-y-1 text-sm">
            <span className="font-semibold text-muted-foreground">Categoría</span>
            <select
              id="mobile-product-category"
              aria-label="Filtrar por categoría"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span className="font-semibold text-muted-foreground">Etiqueta</span>
            <select
              id="mobile-product-tag"
              aria-label="Filtrar por etiqueta"
              value={tagId}
              onChange={(event) => setTagId(event.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas las etiquetas</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span className="font-semibold text-muted-foreground">Estado</span>
            <select
              id="mobile-product-status"
              aria-label="Filtrar por estado"
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="visible">Visibles</option>
              <option value="hidden">Ocultos</option>
              <option value="paused">Pausados</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filteredProducts.length} de {products.length} producto(s)
            {hasFilters ? " con los filtros aplicados" : ""}.
          </p>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={() => {
                setQuery("");
                setCategoryId("");
                setTagId("");
                setStatus("all");
              }}
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            Ningún producto coincide con los filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => {
            const status = productStatus(product);
            const codes = getProductCodes(product);

            return (
              <Card key={product.id} className="py-2">
                <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight">{product.name}</h3>
                    <p className="mt-0.5 text-sm font-medium">
                      {formatMoney(getPrice(product), currency)}
                    </p>
                  </div>
                  <div className="row-span-2 flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-12 gap-1.5 px-2 text-sm"
                      render={<Link href={`/products/${product.slug}`} />}
                      aria-label={`Editar ${product.name}`}
                    >
                      <Edit className="size-6" aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      render={
                        <Link
                          href={`/s/${storeSlug}/${product.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                      aria-label={`Abrir ${product.name} en el catálogo público`}
                      title="Abrir producto público en una pestaña nueva"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant={status === "Disponible" ? "default" : "secondary"}>
                      {status}
                    </Badge>
                    {codes.length > 0 ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Barcode className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {codes[0]}
                          {codes.length > 1 ? ` +${codes.length - 1}` : ""}
                        </span>
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="size-3.5 shrink-0" aria-hidden="true" />
                      {inventorySummary(product)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getPrice(product: Product): number {
  const activeVariants = product.variants.filter((variant) => variant.active);
  if (activeVariants.length === 0) return product.price_cents ?? 0;
  return Math.min(...activeVariants.map((variant) => variant.final_price_cents));
}

function productStatus(product: Product): string {
  if (!product.active) return "Oculto";
  if (product.paused) return "Pausado";

  const activeVariants = product.variants.filter((variant) => variant.active);
  const hasStock = activeVariants.some(
    (variant) => variant.stock === null || variant.stock > 0
  );
  if (!hasStock) return "Agotado";
  if (activeVariants.every((variant) => variant.stock === null)) return "Por encargo";
  return "Disponible";
}

function getProductCodes(product: Product): string[] {
  return [...new Set(
    product.variants
      .map((variant) => variant.sku?.trim())
      .filter((sku): sku is string => Boolean(sku))
  )];
}

function inventorySummary(product: Product): string {
  const activeVariants = product.variants.filter((variant) => variant.active);
  if (activeVariants.length === 0) return "0 unidades";
  if (activeVariants.every((variant) => variant.stock === null)) return "Por encargo";

  const quantities = new Map<string, number>();
  for (const variant of activeVariants) {
    if (variant.stock === null) continue;
    const unit = variant.stock_unit?.trim() || "unidades";
    quantities.set(unit, (quantities.get(unit) ?? 0) + variant.stock);
  }

  const summary = [...quantities].map(([unit, quantity]) => `${quantity} ${unit}`);
  if (activeVariants.some((variant) => variant.stock === null)) {
    summary.push("por encargo");
  }
  return summary.join(" · ");
}
