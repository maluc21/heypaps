"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateProduct } from "@/lib/actions/product";
import { Edit } from "lucide-react";
import { useRouter } from "next/navigation";

type FilterOption = {
  id: string;
  name: string;
};

type StatusFilter = "all" | "visible" | "hidden" | "paused";

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
  version?: number;
};

export function ProductListMobile({
  products,
  categories,
  tags,
}: {
  products: Product[];
  categories: FilterOption[];
  tags: FilterOption[];
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const router = useRouter();

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

  async function handleToggle(product: Product) {
    setLoading(product.id);
    try {
      await updateProduct(product.id, product.version ?? 1, { active: !product.active });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

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
      <div className="space-y-3">
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
              className="min-h-[40px]"
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
        <div className="space-y-2">
          {filteredProducts.map((product) => (
            <Card key={product.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    ${((product.price_cents ?? 0) / 100).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={product.active ? "outline" : "default"}
                    disabled={loading === product.id}
                    onClick={() => handleToggle(product)}
                    className="min-h-[44px]"
                  >
                    {product.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] px-3"
                    render={<Link href={`/products/${product.slug}`} />}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
