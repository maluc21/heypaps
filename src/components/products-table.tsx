'use client'

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/utils";
import { bulkUpdateProducts } from "@/lib/actions/product";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PackagePlus, Trash2 } from "lucide-react";

export type Variant = {
  id: string;
  attributes: Record<string, unknown>;
  price_cents: number;
  final_price_cents: number;
  stock: number | null;
  active: boolean;
  position: number;
};

export type Product = {
  id: string;
  store_id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  paused: boolean;
  featured: boolean;
  position: number;
  version: number;
  category_id: string | null;
  tag_id: string | null;
  variants: Variant[];
};

export type FilterOption = {
  id: string;
  name: string;
};

type StatusFilter = "all" | "visible" | "hidden" | "paused";

type ProductsTableProps = {
  initialProducts: Product[];
  categories: FilterOption[];
  tags: FilterOption[];
  currency: string;
};

export function ProductsTable({
  initialProducts,
  categories,
  tags,
  currency,
}: ProductsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deleting, setDeleting] = useState(false);

  /**
   * Recarga la lista desde el servidor.
   *
   * Antes consultaba la base con el cliente de Supabase en el navegador: eso
   * metia el SDK entero en el bundle de esta pagina (miles de KB de mas).
   * router.refresh() vuelve a pedir los datos al Server Component, que ya los
   * carga con la sesion del usuario.
   */
  const reload = async () => {
    router.refresh();
  };

  const statusOf = (p: Product): string => {
    if (!p.active) return "Oculto";
    if (p.paused) return "Pausado";
    const activeVariants = p.variants.filter((v) => v.active);
    const anyStock = activeVariants.some((v) => v.stock === null || (v.stock ?? 0) > 0);
    if (!anyStock) return "Agotado";
    if (activeVariants.every((v) => v.stock === null)) return "Por encargo";
    return "Disponible";
  };

  const priceFrom = (p: Product): number | null => {
    const actives = p.variants.filter((v) => v.active);
    if (actives.length === 0) return null;
    return Math.min(...actives.map((v) => v.final_price_cents));
  };

  // Buscador y filtros sobre lo ya cargado: con el tope del plan (30
  // productos en el free) es instantaneo.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialProducts.filter((p) => {
      if (q) {
        const haystack = `${p.name} ${p.description ?? ""} ${p.slug}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryId && p.category_id !== categoryId) return false;
      if (tagId && p.tag_id !== tagId) return false;
      if (status === "visible" && !p.active) return false;
      if (status === "hidden" && p.active) return false;
      if (status === "paused" && !p.paused) return false;
      return true;
    });
  }, [initialProducts, query, categoryId, tagId, status]);

  const hasFilters =
    query.trim() !== "" || categoryId !== "" || tagId !== "" || status !== "all";

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const tagNames = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name])),
    [tags],
  );

  const handleBulk = async (action: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.warning("Selecciona al menos un producto.");
      return;
    }
    const res = await bulkUpdateProducts(ids, action, {});
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.count} producto(s) actualizado(s).`);
    setSelected(new Set());
    await reload();
  };

  const handleDelete = async (product: Product) => {
    if (deleting || !window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;

    setDeleting(true);
    try {
      const res = await bulkUpdateProducts([product.id], "archive");
      if (res.error) {
        toast.error(res.error);
        return;
      }

      setSelected((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
      toast.success("Producto eliminado del catálogo.");
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Productos</h2>
        <div className="flex gap-2">
          <Button
            render={<Link href="/products/nuevo" />}
            size="lg"
            className="justify-center gap-2 font-semibold"
          >
            <PackagePlus className="size-5" aria-hidden="true" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {initialProducts.length === 0 ? (
        <div className="rounded-xl border border-[#efefeb] bg-card p-8 text-center text-muted-foreground">
          No hay productos todavía. Crea tu primero para publicar tu catálogo.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Input
              id="product-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
              aria-label="Buscar productos"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label="Filtrar por categoría"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtrar por etiqueta"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="">Todas las etiquetas</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtrar por estado"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="visible">Visibles</option>
                <option value="hidden">Ocultos</option>
                <option value="paused">Pausados</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {initialProducts.length} producto(s)
              {hasFilters ? " con los filtros aplicados" : ""}.
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
              Ningún producto coincide con el filtro.
            </div>
          ) : (
            <>
            {selected.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/50 p-3">
              <span className="text-sm font-medium">
                {selected.size} producto(s) seleccionado(s)
              </span>
              <div className="flex gap-2">
                <Button onClick={() => handleBulk("activate")} size="sm">
                  Activar
                </Button>
                <Button onClick={() => handleBulk("deactivate")} variant="outline" size="sm">
                  Desactivar
                </Button>
                <Button onClick={() => handleBulk("pause")} variant="outline" size="sm">
                  Pausar
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-[#181818] bg-white">
              <table className="w-full min-w-200 bg-white text-sm">
                <thead>
                  <tr className="border-b bg-white">
                    <th className="p-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="Seleccionar todos"
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left p-3">Producto</th>
                    <th className="text-left p-3">Categoría</th>
                    <th className="text-left p-3">Etiqueta</th>
                    <th className="text-right p-3">Precio</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-center p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b bg-white hover:bg-[#efefeb]">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Seleccionar ${p.name}`}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/products/${p.slug}`}
                          className="font-medium text-primary-foreground hover:underline underline-offset-4"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="p-3">{categoryNames.get(p.category_id ?? "") ?? "—"}</td>
                      <td className="p-3">{tagNames.get(p.tag_id ?? "") ?? "—"}</td>
                      <td className="text-right p-3">
                        {priceFrom(p) == null ? "—" : formatMoney(priceFrom(p)!, currency)}
                      </td>
                      <td className="p-3">
                        <Badge variant={statusOf(p) === "Disponible" ? "default" : "secondary"}>
                          {statusOf(p)}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="icon"
                          variant="destructive"
                          disabled={deleting}
                          onClick={() => void handleDelete(p)}
                          aria-label={`Eliminar ${p.name} del catálogo`}
                          title={`Eliminar ${p.name} del catálogo`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
