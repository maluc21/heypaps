'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { updateProduct } from "@/lib/actions/product";
import { setProductCategory } from "@/lib/actions/category";
import { setProductTag } from "@/lib/actions/tag";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImageManager } from "@/components/product-image-manager";

type Product = {
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
  images: string[];
  category_id: string | null;
  tag_id: string | null;
  variants: Array<{
    id: string;
    attributes: Record<string, unknown>;
    price_cents: number;
    final_price_cents: number;
    stock: number | null;
    active: boolean;
    position: number;
  }>;
};

type CategoryOption = {
  id: string;
  name: string;
};

type TagOption = {
  id: string;
  name: string;
  color: string | null;
};

type ProductEditorFormProps = {
  product: Product;
  maxImages: number;
  categories: CategoryOption[];
  tags: TagOption[];
};

export function ProductEditorForm({
  product,
  maxImages,
  categories,
  tags,
}: ProductEditorFormProps) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [active, setActive] = useState(product.active);
  const [available, setAvailable] = useState(!product.paused);
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [categoryId, setCategoryId] = useState<string>(product.category_id ?? "");
  const [tagId, setTagId] = useState<string>(product.tag_id ?? "");
  const [inventoryMode, setInventoryMode] = useState<"inventario" | "libre">("libre");
  const [stockQuantity, setStockQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const hasVariants = product.variants.length > 0;

  const save = async () => {
    setSaving(true);
    const res = await updateProduct(product.id, product.version, {
      name,
      description,
      active,
      paused: !available,
      images,
    });
    if (res.error === "CONFLICT") {
      toast.error("El producto cambió en otra pestaña. Recarga.");
      setSaving(false);
      return;
    }
    if (res.error) { toast.error(res.error); setSaving(false); return; }
    toast.success("Producto guardado.");
    setSaving(false);
    router.refresh();
  };

  // La categoría y la etiqueta se cambian por su propia RPC: update_product
  // trata null como "conservar", así que no puede quitarlas.
  const changeCategory = async (nextId: string) => {
    const res = await setProductCategory(product.id, nextId || null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setCategoryId(nextId);
    toast.success("Categoría actualizada.");
    router.refresh();
  };

  const changeTag = async (nextId: string) => {
    const res = await setProductTag(product.id, nextId || null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setTagId(nextId);
    toast.success("Etiqueta actualizada.");
    router.refresh();
  };

  const actives = product.variants.filter((v) => v.active);
  const priceFrom = actives.length > 0 ? Math.min(...actives.map((v) => v.final_price_cents)) : null;

  return (
    <div className="p-4 max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Editar producto</h2>
        <Link href="/products" className="text-sm text-muted-foreground hover:text-primary">
          Volver
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{product.name}</CardTitle>
          <CardDescription>
            {priceFrom == null ? "—" : formatMoney(priceFrom, "HNL")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Categoría</Label>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => void changeCategory(e.target.value)}
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
            <Label htmlFor="tag">Etiqueta</Label>
            <select
              id="tag"
              value={tagId}
              onChange={(e) => void changeTag(e.target.value)}
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
          <ProductImageManager
            storeId={product.store_id}
            productId={product.id}
            images={images}
            maxImages={maxImages}
            onChange={setImages}
          />
          <div className="flex items-center gap-2">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active">Visible en el catálogo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="available" checked={available} onCheckedChange={setAvailable} />
            <Label htmlFor="available">{available ? "Disponible" : "No Disponible"}</Label>
          </div>
          {!hasVariants && (
            <div className="space-y-2">
              <Label>Gestión de stock</Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="inventory-mode"
                  checked={inventoryMode === "inventario"}
                  onCheckedChange={(checked) => setInventoryMode(checked ? "inventario" : "libre")}
                />
                <Label htmlFor="inventory-mode">Por Inventario</Label>
              </div>
              {inventoryMode === "inventario" && (
                <div className="space-y-2">
                  <Label htmlFor="stock-quantity">Cantidad disponible</Label>
                  <Input
                    id="stock-quantity"
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
          )}
          {hasVariants && (
            <div className="space-y-2">
              <Label>Gestión de stock</Label>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Switch
                  id="inventory-mode"
                  checked={inventoryMode === "inventario"}
                  disabled
                />
                <Label htmlFor="inventory-mode">Por Inventario</Label>
                <span className="text-sm">Controlado por cada variante</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Badge variant={!available ? "secondary" : "default"}>
              Estado: {!available ? "No Disponible" : active ? "Activo" : "Oculto"}
            </Badge>
            <Badge variant="outline">{product.variants.length} variante(s)</Badge>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
