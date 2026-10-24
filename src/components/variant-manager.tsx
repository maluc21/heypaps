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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Tipos de atributos típicos con sus valores predefinidos.
const ATTRIBUTE_TYPES = [
  { key: "color", label: "Color" },
  { key: "talla-palabra", label: "Talla (palabra)" },
  { key: "talla-codigo", label: "Talla (código)" },
  { key: "libre", label: "Libre" },
] as const;

type AttributeTypeKey = (typeof ATTRIBUTE_TYPES)[number]["key"];

const COLOR_OPTIONS = ["Negro", "Blanco", "Rojo", "Azul", "Verde", "Amarillo", "Gris", "Rosa", "Naranja", "Morado"];

const SIZE_WORD_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const SIZE_CODE_OPTIONS = ["s", "m", "l", "xl", "xxl", "xxxl"];

/** Estado inicial del formulario: vacío para crear, o lo guardado para editar. */
function toFormState(variant: EditableVariant | null): VariantInput {
  if (!variant) {
    return {
      variantId: null,
      attributes: [{ name: "", value: "", type: "libre" }],
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
    attributes: pairs.length > 0 ? pairs.map((p) => ({ ...p, type: "libre" })) : [{ name: "", value: "", type: "libre" }],
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
                    ? "Sin límite de stock"
                    : variant.stock > 0
                      ? `${variant.stock} en stock`
                      : "Agotado"}
                </p>
              </div>
              <Badge variant={variant.active ? "default" : "secondary"}>
                {variant.active ? "Activa" : "Inactiva"}
              </Badge>
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
  const [freeAttributes, setFreeAttributes] = useState(false);
  const [showPrice, setShowPrice] = useState(true);

  // Stock: se valida mientras se escribe, antes de enviar.
  let stockError: string | null = null;
  try {
    stockToStorage(form.stock, form.madeToOrder);
  } catch (err) {
    stockError = (err as Error).message;
  }

  const setPair = (index: number, patch: Partial<AttributePair> & { type?: AttributeTypeKey }) => {
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
      attributes: [...current.attributes, { name: "", value: "", type: "libre" }],
    }));
  };

  const removePair = (index: number) => {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.filter((_, i) => i !== index),
    }));
  };

  const setFreeAttributesToggle = (checked: boolean) => {
    setFreeAttributes(checked);
    if (checked) {
      setForm((current) => ({
        ...current,
        attributes: current.attributes.map((p) => ({ ...p, type: "libre" })),
      }));
    }
  };

  const getValueOptions = (type: AttributeTypeKey): string[] => {
    switch (type) {
      case "color":
        return COLOR_OPTIONS;
      case "talla-palabra":
        return SIZE_WORD_OPTIONS;
      case "talla-codigo":
        return SIZE_CODE_OPTIONS;
      default:
        return [];
    }
  };

  return (
    <form
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      {/* Atributos: tarjeta por tarjeta */}
      <div className="space-y-2">
        <Label>Atributos</Label>
        {form.attributes.map((pair, index) => {
          const options = getValueOptions(pair.type as AttributeTypeKey);
          return (
            <div key={index} className="rounded-lg border border-border p-3 space-y-3">
              {/* Tipo de atributo */}
              <div className="space-y-2">
                <Label htmlFor={`attr-type-${index}`}>Tipo</Label>
                <Select
                  defaultValue={pair.type}
                  onValueChange={(value) => setPair(index, { type: value as AttributeTypeKey })}
                >
                  <SelectTrigger id={`attr-type-${index}`} className="w-full">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTRIBUTE_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor del atributo */}
              <div className="space-y-2">
                <Label htmlFor={`attr-value-${index}`}>Valor</Label>
                {pair.type === "libre" || freeAttributes ? (
                  <Input
                    id={`attr-value-${index}`}
                    placeholder="Valor"
                    value={pair.value}
                    onChange={(e) => setPair(index, { value: e.target.value })}
                  />
                ) : pair.type === "color" ? (
                  <div className="flex gap-1">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setPair(index, { value: color })}
                        className={`w-8 h-8 rounded-full border border-border ${
                          pair.value === color ? "ring-2 ring-primary" : ""
                        }`}
                        style={{ backgroundColor: color.toLowerCase() }}
                        aria-label={color}
                      />
                    ))}
                  </div>
                ) : (
                  <Select
                    defaultValue={pair.value}
                    onValueChange={(value) => setPair(index, { value })}
                  >
                    <SelectTrigger id={`attr-value-${index}`} className="w-full">
                      <SelectValue placeholder="Seleccionar valor" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

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
          );
        })}
        {form.attributes.length < MAX_ATTRIBUTES ? (
          <Button type="button" variant="ghost" size="sm" onClick={addPair}>
            + Agregar atributo
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Cada tarjeta es un atributo independiente (ej. Color, Talla).
        </p>
      </div>

      {/* Atributos libres */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="variant-free-attributes"
            checked={freeAttributes}
            onCheckedChange={setFreeAttributesToggle}
          />
          <Label htmlFor="variant-free-attributes">Atributos libres</Label>
        </div>
        {freeAttributes ? (
          <p className="text-xs text-muted-foreground">
            Los campos de tipo y valor se editan libremente.
          </p>
        ) : null}
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

      {/* Precio atributo toggle */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="variant-show-price"
            checked={showPrice}
            onCheckedChange={setShowPrice}
          />
          <Label htmlFor="variant-show-price">Precio atributo</Label>
        </div>
        {showPrice ? (
          <div className="space-y-2">
            <Label htmlFor="variant-stock-label">Cantidad (stock)</Label>
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
            <div className="flex items-center gap-2">
              <Switch
                id="variant-inventory-mode"
                checked={!form.madeToOrder}
                onCheckedChange={(checked) => setForm({ ...form, madeToOrder: !checked })}
              />
              <Label htmlFor="variant-inventory-mode">Por Inventario</Label>
            </div>
          </div>
        ) : null}
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
