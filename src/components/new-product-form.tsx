"use client";

/**
 * Alta de producto desde el panel (plan §2.2, §2.3).
 *
 * Las fotos se añaden despues, en la ficha del producto: el flujo en dos
 * pasos evita que una subida fallida deje archivos huerfanos en el DAM.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createProduct } from "@/lib/actions/product-create";

export type ProductOption = {
  id: string;
  name: string;
};

type Props = {
  storeId: string;
  currency: string;
  categories: ProductOption[];
  tags: ProductOption[];
  maxProducts: number;
  currentProducts: number;
};

export function NewProductForm({
  storeId,
  currency,
  categories,
  tags,
  maxProducts,
  currentProducts,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [inventoryMode, setInventoryMode] = useState<"inventario" | "libre">("libre");
  const [stockQuantity, setStockQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const atLimit = currentProducts >= maxProducts;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (atLimit) {
      toast.error(`Tu plan permite ${maxProducts} productos.`);
      return;
    }

    setSaving(true);
    const res = await createProduct({
      storeId,
      name,
      description,
      price,
      categoryId: categoryId || null,
      tagId: tagId || null,
      stock: inventoryMode === "inventario" ? stockQuantity : undefined,
      madeToOrder: inventoryMode === "libre",
    });
    setSaving(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Producto creado. Añade sus fotos.");
    router.push(`/products/${res.slug}`);
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-4 pb-24">
      <h2 className="text-lg font-semibold">Nuevo producto</h2>

      {atLimit ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Alcanzaste el límite de {maxProducts} productos de tu plan.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Detalles</CardTitle>
          <CardDescription>
            {currentProducts} de {maxProducts} productos usados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Nombre</Label>
            <Input
              id="new-name"
              value={name}
              placeholder="Camiseta de algodón"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-description">Descripción</Label>
            <Textarea
              id="new-description"
              value={description}
              placeholder="Tela suave, disponible en varios colores."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-price">Precio ({currency})</Label>
            <Input
              id="new-price"
              inputMode="decimal"
              placeholder="450.50"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-category">Categoría</Label>
              <select
                id="new-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-tag">Etiqueta</Label>
              <select
                id="new-tag"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Sin etiqueta</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Gestión de stock</Label>
            <div className="flex items-center gap-2">
              <Switch
                id="new-inventory-mode"
                checked={inventoryMode === "inventario"}
                onCheckedChange={(checked) => setInventoryMode(checked ? "inventario" : "libre")}
              />
              <Label htmlFor="new-inventory-mode">Por Inventario</Label>
            </div>
            {inventoryMode === "inventario" && (
              <div className="space-y-2">
                <Label htmlFor="new-stock-quantity">Cantidad disponible</Label>
                <Input
                  id="new-stock-quantity"
                  inputMode="numeric"
                  placeholder="Unidades disponibles"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                />
              </div>
            )}
            {inventoryMode === "libre" && (
              <p className="text-xs text-muted-foreground">Sin límite de stock (Libre).</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/products")}
          >
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={saving || atLimit}>
            {saving ? "Creando…" : "Crear producto"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
