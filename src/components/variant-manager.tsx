"use client";

/**
 * Editor de variantes del producto (plan §2.3): tallas, colores, precio,
 * descuento, stock y visibilidad de cada combinación.
 *
 * Las reglas de negocio viven en src/lib/variants.ts y en la base; aquí solo
 * se captura el formulario y se muestran los errores.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteVariant, saveVariant, type VariantInput } from "@/lib/actions/variant";
import { formatMoney } from "@/lib/utils";
import {
  MAX_ATTRIBUTES,
  attributesFromPairs,
  hidesSinglePresentation,
  pairsFromAttributes,
  stockToStorage,
  variantLabel,
  type AttributePair,
  type DiscountType,
} from "@/lib/variants";

export type EditableVariant = {
  id: string;
  attributes: Record<string, unknown>;
  sku: string | null;
  price_cents: number;
  final_price_cents: number;
  discount_type: DiscountType;
  discount_value: number;
  stock: number | null;
  active: boolean;
  position: number;
};

type Props = {
  productId: string;
  productVersion: number;
  currency: string;
  variants: EditableVariant[];
};

/** Estado inicial del formulario: vacío para crear, o lo guardado para editar. */
function toFormState(variant: EditableVariant | null): VariantInput {
  if (!variant) {
    return {
      variantId: null,
      attributes: [{ name: "", value: "" }],
      sku: "",
      price: "",
      discountType: "none",
      discountValue: "",
      madeToOrder: false,
      stock: "",
      active: true,
    };
  }
  const pairs = pairsFromAttributes(variant.attributes);
  return {
    variantId: variant.id,
    attributes: pairs.length > 0 ? pairs : [{ name: "", value: "" }],
    sku: variant.sku ?? "",
    price: (variant.price_cents / 100).toFixed(2),
    discountType: variant.discount_type,
    discountValue:
      variant.discount_type === "fixed"
        ? (variant.discount_value / 100).toFixed(2)
        : String(variant.discount_value),
    madeToOrder: variant.stock === null,
    stock: variant.stock === null ? "" : String(variant.stock),
    active: variant.active,
  };
}

export function VariantManager({ productId, productVersion, currency, variants }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<VariantInput | null>(null);
  const [busy, setBusy] = useState(false);

  const afterChange = () => {
    setEditing(null);
    router.refresh();
  };

  const handleError = (error: string) => {
    if (error === "CONFLICT") {
      toast.error("El producto cambió en otra pestaña. Recarga la página.");
      return;
    }
    toast.error(error);
  };

  const handleSave = async (input: VariantInput) => {
    setBusy(true);
    const res = await saveVariant(productId, productVersion, input);
    setBusy(false);
    if (res.error) {
      handleError(res.error);
      return;
    }
    const attributes = attributesFromPairs(input.attributes);
    const hidSingle = hidesSinglePresentation(
      attributes,
      input.active,
      variants,
      input.variantId,
    );
    if (hidSingle) {
      toast.success("Variante creada. La presentación única se ocultó porque ahora hay tallas o colores.");
    } else {
      toast.success(input.variantId ? "Variante actualizada." : "Variante creada.");
    }
    afterChange();
  };

  const handleDelete = async (variant: EditableVariant) => {
    if (!window.confirm(`¿Eliminar la variante "${variantLabel(variant.attributes)}"?`)) return;
    setBusy(true);
    const res = await deleteVariant(productId, variant.id, productVersion);
    setBusy(false);
    if (res.error) {
      handleError(res.error);
      return;
    }
    toast.success("Variante eliminada.");
    router.refresh();
  };

  const sorted = [...variants].sort((a, b) => a.final_price_cents - b.final_price_cents);
  // Si solo queda una variante activa no se puede ocultar: el producto necesita
  // al menos una visible (la base también lo rechaza).
  const activeOnes = variants.filter((v) => v.active);
  const onlyActiveVariantId = activeOnes.length === 1 ? activeOnes[0].id : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variantes</CardTitle>
        <CardDescription>
          Tallas, colores o presentaciones. Cada combinación tiene su precio y stock.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {sorted.map((variant) => (
            <li
              key={variant.id}
              className="flex items-center gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {variantLabel(variant.attributes)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(variant.final_price_cents, currency)}
                  {variant.final_price_cents !== variant.price_cents ? (
                    <span className="line-through"> {formatMoney(variant.price_cents, currency)}</span>
                  ) : null}
                  {" · "}
                  {variant.stock === null
                    ? "Por encargo"
                    : variant.stock > 0
                      ? `${variant.stock} en stock`
                      : "Agotado"}
                </p>
              </div>
              {variant.active ? null : <Badge variant="secondary">Oculta</Badge>}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(toFormState(variant))}
                aria-label={`Editar ${variantLabel(variant.attributes)}`}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleDelete(variant)}
                aria-label={`Eliminar ${variantLabel(variant.attributes)}`}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>

        {editing ? (
          <VariantForm
            key={editing.variantId ?? "new"}
            initial={editing}
            currency={currency}
            busy={busy}
            canHide={!onlyActiveVariantId || onlyActiveVariantId !== editing.variantId}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => setEditing(toFormState(null))}
          >
            Nueva variante
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function VariantForm({
  initial,
  currency,
  busy,
  canHide,
  onCancel,
  onSave,
}: {
  initial: VariantInput;
  currency: string;
  busy: boolean;
  canHide: boolean;
  onCancel: () => void;
  onSave: (input: VariantInput) => void;
}) {
  const [form, setForm] = useState<VariantInput>(initial);

  // Stock: se valida mientras se escribe, antes de enviar. La misma regla de
  // src/lib/variants.ts que aplica el servidor.
  let stockError: string | null = null;
  try {
    stockToStorage(form.stock, form.madeToOrder);
  } catch (err) {
    stockError = (err as Error).message;
  }

  const setPair = (index: number, patch: Partial<AttributePair>) => {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((pair, i) =>
        i === index ? { ...pair, ...patch } : pair,
      ),
    }));
  };

  const addPair = () => {
    setForm((current) => ({
      ...current,
      attributes: [...current.attributes, { name: "", value: "" }],
    }));
  };

  const removePair = (index: number) => {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.filter((_, i) => i !== index),
    }));
  };

  return (
    <form
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <div className="space-y-2">
        <Label>Atributos</Label>
        {form.attributes.map((pair, index) => (
          <div key={index} className="flex gap-2">
            <Input
              aria-label={`Nombre del atributo ${index + 1}`}
              placeholder="Talle"
              value={pair.name}
              onChange={(e) => setPair(index, { name: e.target.value })}
            />
            <Input
              aria-label={`Valor del atributo ${index + 1}`}
              placeholder="M"
              value={pair.value}
              onChange={(e) => setPair(index, { value: e.target.value })}
            />
            {form.attributes.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removePair(index)}
                aria-label={`Quitar atributo ${index + 1}`}
              >
                ✕
              </Button>
            ) : null}
          </div>
        ))}
        {form.attributes.length < MAX_ATTRIBUTES ? (
          <Button type="button" variant="ghost" size="sm" onClick={addPair}>
            + Agregar atributo
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Deja vacío para un producto sin variantes (una sola presentación).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="variant-price">Precio ({currency})</Label>
          <Input
            id="variant-price"
            inputMode="decimal"
            placeholder="450.50"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="variant-sku">SKU (opcional)</Label>
          <Input
            id="variant-sku"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="variant-discount-type">Descuento</Label>
          <select
            id="variant-discount-type"
            value={form.discountType}
            onChange={(e) =>
              setForm({ ...form, discountType: e.target.value as DiscountType, discountValue: "" })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="none">Sin descuento</option>
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed">Monto fijo</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="variant-discount-value">
            {form.discountType === "percent" ? "Porcentaje" : "Monto"}
          </Label>
          <Input
            id="variant-discount-value"
            inputMode="decimal"
            disabled={form.discountType === "none"}
            placeholder={form.discountType === "percent" ? "10" : "50.00"}
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="variant-inventory-mode"
            checked={!form.madeToOrder}
            onCheckedChange={(checked) => setForm({ ...form, madeToOrder: !checked })}
          />
          <Label htmlFor="variant-inventory-mode">Por Inventario</Label>
        </div>
        {!form.madeToOrder ? (
          <>
            <Input
              id="variant-stock"
              inputMode="numeric"
              placeholder="Unidades disponibles"
              aria-invalid={stockError !== null}
              aria-describedby={stockError ? "variant-stock-error" : undefined}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
            {stockError ? (
              <p id="variant-stock-error" className="text-xs text-destructive" role="alert">
                {stockError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="variant-active"
          checked={form.active}
          disabled={!canHide}
          onCheckedChange={(checked) => setForm({ ...form, active: checked })}
        />
        <Label htmlFor="variant-active">Visible en el catálogo</Label>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={busy || stockError !== null}>
          {busy ? "Guardando…" : "Guardar variante"}
        </Button>
      </div>
    </form>
  );
}
