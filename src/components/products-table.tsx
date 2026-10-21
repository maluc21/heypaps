'use client'

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";
import { bulkUpdateProducts, updateProduct } from "@/lib/actions/product";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  variants: Variant[];
};

export function ProductsTable({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchProducts = async (): Promise<Product[] | null> => {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("products")
      .select("*, variants(*)")
      .order("position", { ascending: true });
    if (error) {
      toast.error("No se pudieron cargar los productos.");
      return null;
    }
    return (data ?? []) as Product[];
  };

  const reload = async () => {
    const data = await fetchProducts();
    if (data != null) {
      setProducts(data);
    }
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

  const toggleActive = async (id: string, active: boolean, version: number) => {
    const res = await updateProduct(id, version, { active });
    if (res.error === "CONFLICT") {
      toast.error("El producto cambió en otra pestaña. Recarga la página.");
      await reload();
      return;
    }
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Producto actualizado.");
    await reload();
  };

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
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Productos</h2>
        <div className="flex gap-2">
          <Button onClick={() => handleBulk("activate")} disabled={selected.size === 0} size="sm">
            Activar
          </Button>
          <Button onClick={() => handleBulk("deactivate")} disabled={selected.size === 0} variant="outline" size="sm">
            Desactivar
          </Button>
          <Button onClick={() => handleBulk("pause")} disabled={selected.size === 0} variant="outline" size="sm">
            Pausar
          </Button>
          <Link
            href="/products/nuevo"
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow hover:bg-primary/90"
          >
            Nuevo producto
          </Link>
        </div>
      </div>

      {products.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          No hay productos todavía. Crea tu primero para publicar tu catálogo.
        </div>
      )}

      {products.length > 0 && (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todos"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left p-3">Producto</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-right p-3">Precio</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
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
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.slug}</div>
                  </td>
                  <td className="p-3">
                    <Badge variant={statusOf(p) === "Disponible" ? "default" : "secondary"}>
                      {statusOf(p)}
                    </Badge>
                  </td>
                  <td className="text-right p-3">
                    {priceFrom(p) == null ? "—" : formatMoney(priceFrom(p)!, "HNL")}
                  </td>
                  <td className="text-right p-3 space-x-2">
                    <Button
                      size="sm"
                      onClick={() => toggleActive(p.id, !p.active, p.version)}
                      variant={p.active ? "destructive" : "default"}
                    >
                      {p.active ? "Ocultar" : "Mostrar"}
                    </Button>
                    <Link
                      href={`/products/${p.slug}`}
                      className="text-sm text-muted-foreground hover:text-primary underline-offset-4"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
