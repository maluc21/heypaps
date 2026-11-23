'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateProduct } from "@/lib/actions/product";
import { saveVariant } from "@/lib/actions/variant";
import { setProductCategory } from "@/lib/actions/category";
import { setProductTag } from "@/lib/actions/tag";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImageManager } from "@/components/product-image-manager";
import { VariantManager, type EditableVariant } from "@/components/variant-manager";
import {
  InventoryModeOptions,
  type InventoryMode,
} from "@/components/inventory-mode-options";
import { stockToStorage } from "@/lib/variants";
import { ArrowLeft, DollarSign, ExternalLink, MessageCircle } from "lucide-react";

type Product = {
  id: string;
  store_id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  paused: boolean;
  featured: boolean;
  show_price: boolean;
  position: number;
  version: number;
  images: string[];
  category_id: string | null;
  tag_id: string | null;
  variants: EditableVariant[];
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

type ProductStatus = "available" | "unavailable" | "hidden";

const PRODUCT_STATUS_OPTIONS = [
  { value: "available", label: "Disponible", dotClassName: "bg-green-600" },
  { value: "unavailable", label: "No disponible", dotClassName: "bg-red-500" },
  { value: "hidden", label: "Oculto", dotClassName: "bg-gray-400" },
] as const;

const productStatusOptionContent = (
  option: (typeof PRODUCT_STATUS_OPTIONS)[number],
) => (
  <span className="inline-flex items-center gap-2">
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${option.dotClassName}`}
    />
    {option.label}
  </span>
);

const PRODUCT_STATUS_ITEMS = PRODUCT_STATUS_OPTIONS.map((option) => ({
  value: option.value,
  label: productStatusOptionContent(option),
}));

type ProductEditorFormProps = {
  product: Product;
  storeSlug?: string;
  maxImages: number;
  categories: CategoryOption[];
  tags: TagOption[];
  currency?: string;
  pricingMode?: string;
};

export function ProductEditorForm({
  product,
  storeSlug,
  maxImages,
  categories,
  tags,
  currency = "HNL",
  pricingMode = "SHOW_ALL",
}: ProductEditorFormProps) {
  const router = useRouter();
  const attributedVariants = product.variants.filter(
    (variant) => Object.keys(variant.attributes ?? {}).length > 0,
  );
  const hasVariants = attributedVariants.length > 0;
  const hasVariantInventory = attributedVariants.some(
    (variant) => variant.stock !== null,
  );
  const baseVariant =
    product.variants.find(
      (variant) => Object.keys(variant.attributes ?? {}).length === 0,
    ) ?? null;
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [productStatus, setProductStatus] = useState<ProductStatus>(
    !product.active ? "hidden" : product.paused ? "unavailable" : "available",
  );
  const [showPrice, setShowPrice] = useState(product.show_price ?? true);
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [categoryId, setCategoryId] = useState<string>(product.category_id ?? "");
  const [tagId, setTagId] = useState<string>(product.tag_id ?? "");
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>(
    hasVariantInventory
      ? "variants"
      : baseVariant?.stock == null
        ? "none"
        : "global",
  );
  const [stockQuantity, setStockQuantity] = useState(
    baseVariant?.stock == null ? "" : String(baseVariant.stock),
  );
  const [saving, setSaving] = useState(false);

  const [basePrice, setBasePrice] = useState(
    baseVariant
      ? (baseVariant.price_cents / 100).toFixed(2)
      : product.variants.length
        ? (Math.min(...product.variants.map((v) => v.price_cents)) / 100).toFixed(2)
        : "",
  );

  const save = async () => {
    let baseStock = baseVariant?.stock ?? null;
    if (!hasVariantInventory) {
      try {
        baseStock = stockToStorage(stockQuantity, inventoryMode !== "global");
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
    }

    setSaving(true);
    const res = await updateProduct(product.id, product.version, {
      name,
      description,
      active: productStatus !== "hidden",
      paused: productStatus === "unavailable",
      images,
      showPrice: pricingMode === "CUSTOM" ? showPrice : undefined,
    });
    if (res.error === "CONFLICT") {
      toast.error("El producto cambió en otra pestaña. Recarga.");
      setSaving(false);
      return;
    }
    if (res.error) { toast.error(res.error); setSaving(false); return; }

    const enteredPriceCents = Math.round(Number(basePrice) * 100);
    const basePriceCents =
      enteredPriceCents > 0 ? enteredPriceCents : baseVariant?.price_cents ?? 0;
    const shouldSaveBase =
      basePriceCents > 0 &&
      (!baseVariant ||
        basePriceCents !== baseVariant.price_cents ||
        (!hasVariantInventory && baseStock !== baseVariant.stock));

    if (shouldSaveBase) {
      const discountValue =
        baseVariant?.discount_type === "fixed"
          ? (baseVariant.discount_value / 100).toFixed(2)
          : String(baseVariant?.discount_value ?? 0);
      const vr = await saveVariant(product.id, product.version + 1, {
        variantId: baseVariant?.id ?? null,
        attributes: [],
        sku: baseVariant?.sku ?? "",
        price:
          enteredPriceCents > 0
            ? basePrice
            : ((baseVariant?.price_cents ?? 0) / 100).toFixed(2),
        discountType: baseVariant?.discount_type ?? "none",
        discountValue,
        madeToOrder: baseStock === null,
        stock: baseStock === null ? "" : String(baseStock),
        stockUnit: baseVariant?.stock_unit ?? "",
        active: baseVariant?.active ?? true,
      });
      if (vr.error) {
        toast.error(
          vr.error === "CONFLICT"
            ? "El producto cambió en otra pestaña. Recarga."
            : vr.error,
        );
        setSaving(false);
        return;
      }
    }

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

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 lg:col-span-2 lg:row-start-1 lg:grid-cols-2 lg:grid-rows-[auto_auto]">
          <div className="col-start-2 row-start-1 inline-flex min-h-8 shrink-0 items-center gap-2 lg:col-start-1">
            {storeSlug ? (
              <Link
                href={`/s/${storeSlug}/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir ${product.name} en el catálogo público`}
                title="Abrir producto público en una pestaña nueva"
                className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-primary-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Ver en catálogo</span>
              </Link>
            ) : null}
            <Link
              href="/products"
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 text-xs text-primary-foreground hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Regresar
            </Link>
          </div>
          <h2 className="col-start-1 row-start-1 min-w-0 text-base font-semibold leading-tight lg:row-start-2">
            Editar producto
          </h2>
          <Button
            onClick={save}
            disabled={saving}
            className="hidden w-auto lg:col-start-2 lg:row-start-2 lg:inline-flex lg:justify-self-end"
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>

        <div className="space-y-4 lg:col-start-1 lg:row-start-2">
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="min-w-0 break-words">{name}</CardTitle>
              <div className="w-36 max-w-full">
                <Label htmlFor="product-status-desktop" className="sr-only">
                  Estado del producto
                </Label>
                <select
                  id="product-status-mobile"
                  value={productStatus}
                  onChange={(event) =>
                    setProductStatus(event.target.value as ProductStatus)
                  }
                  aria-label="Estado del producto"
                  className="h-10 w-36 max-w-full rounded-md border border-input bg-background px-2 text-sm sm:hidden"
                >
                  <option value="available">🟢 Disponible</option>
                  <option value="unavailable">🔴 No disponible</option>
                  <option value="hidden">⚪ Oculto</option>
                </select>
                <div className="hidden sm:block">
                  <Select
                    items={PRODUCT_STATUS_ITEMS}
                    value={productStatus}
                    onValueChange={(value) => {
                      if (value) setProductStatus(value as ProductStatus);
                    }}
                  >
                    <SelectTrigger
                      id="product-status-desktop"
                      aria-label="Estado del producto"
                      className="h-10 w-36 max-w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {productStatusOptionContent(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
              {pricingMode === "CUSTOM" ? (
                <div
                  role="radiogroup"
                  aria-label="Visibilidad del precio"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <label className="min-w-0 cursor-pointer">
                    <input
                      type="radio"
                      name="show-price"
                      checked={showPrice}
                      onChange={() => setShowPrice(true)}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-14 items-center gap-2 rounded-xl border border-border p-3 transition-colors peer-checked:border-border peer-checked:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                      <DollarSign
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap text-sm font-semibold leading-tight">
                          Mostrar Precio
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                          showPrice ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-[#128b2b] transition-transform ${
                            showPrice ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </span>
                  </label>
                  <label className="min-w-0 cursor-pointer">
                    <input
                      type="radio"
                      name="show-price"
                      checked={!showPrice}
                      onChange={() => setShowPrice(false)}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-14 items-center gap-2 rounded-xl border border-border p-3 transition-colors peer-checked:border-border peer-checked:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                      <MessageCircle
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap text-sm font-semibold leading-tight">
                          Sin Precio
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                          !showPrice ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-[#128b2b] transition-transform ${
                            !showPrice ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </span>
                  </label>
                </div>
              ) : pricingMode === "SHOW_ALL" ? (
                <p className="text-xs text-muted-foreground">
                  Precio visible en todos los productos (configuración global).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Precio a solicitud en todos los productos (configuración global).
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="base-price">Precio ({currency})</Label>
                <Input
                  id="base-price"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  disabled={pricingMode === "REQUEST_ALL" || (pricingMode === "CUSTOM" && !showPrice)}
                  className={
                    pricingMode === "REQUEST_ALL" || (pricingMode === "CUSTOM" && !showPrice)
                      ? "opacity-50 cursor-not-allowed bg-muted"
                      : ""
                  }
                />
                {pricingMode === "REQUEST_ALL" ? (
                  <p className="text-xs text-muted-foreground">Precio bloqueado por la configuración global de la tienda.</p>
                ) : null}
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
              {!hasVariantInventory && (
                <InventoryModeOptions
                  idPrefix="product-inventory-mode"
                  value={inventoryMode}
                  onChange={setInventoryMode}
                  variantDescription={
                    hasVariants
                      ? "Asigna stock a las variantes existentes."
                      : "Agrega variantes para asignar stock a cada una."
                  }
                >
                  {inventoryMode === "global" ? (
                    <div className="space-y-2">
                      <Label htmlFor="stock-quantity">Cantidad disponible</Label>
                      <Input
                        id="stock-quantity"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(e.target.value)}
                      />
                    </div>
                  ) : inventoryMode === "variants" ? (
                    <a
                      href="#variant-manager"
                      className="inline-flex min-h-9 items-center text-sm font-medium text-primary-foreground underline-offset-4 hover:underline"
                    >
                      Ir a Variantes
                    </a>
                  ) : null}
                </InventoryModeOptions>
              )}
              {hasVariantInventory && (
                <div className="space-y-2">
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-sm font-semibold">Inventario por variantes</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Configura la cantidad disponible en cada variante.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div id="variant-manager" className="scroll-mt-20">
            <VariantManager
              productId={product.id}
              productVersion={product.version}
              currency={currency}
              variants={product.variants}
              pricingMode={pricingMode}
            />
          </div>
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <Card>
            <CardHeader>
              <CardTitle>Imágenes</CardTitle>
              <CardAction>
                <Badge variant="outline">
                  {images.length}/{maxImages}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ProductImageManager
                storeId={product.store_id}
                productId={product.id}
                images={images}
                maxImages={maxImages}
                onChange={setImages}
              />
            </CardContent>
          </Card>
        </div>
        <Button onClick={save} disabled={saving} className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.25rem)] z-30 w-full shadow-lg lg:hidden">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  )
}
