"use client";

/**
 * Editor de variantes del producto (plan §2.3): tallas, colores, precio,
 * descuento, stock y visibilidad de cada combinación.
 *
 * Las reglas de negocio viven en src/lib/variants.ts y en la base; aquí solo
 * se captura el formulario y se muestran los errores.
 */

import { useMemo, useState } from "react";
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
import { COLOR_HEX, COLOR_OPTIONS } from "@/lib/colors";
import { parseAmountToCents } from "@/lib/money";
import { formatMoney } from "@/lib/utils";
import {
  attributesFromPairs,
  hidesSinglePresentation,
  pairsFromAttributes,
  stockToStorage,
  variantLabel,
  SIZE_UNITS,
  WEIGHT_UNITS,
  type AttributePair,
  type AttributeTypeKey,
  type DiscountType,
  type SizeDimensions,
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
  stock_unit: string | null;
  active: boolean;
  position: number;
};

type Props = {
  productId: string;
  productVersion: number;
  currency: string;
  variants: EditableVariant[];
  pricingMode?: string;
};

// Tipos de atributos típicos con sus valores predefinidos.
const ATTRIBUTE_TYPES = [
  { key: "color", label: "Color" },
  { key: "talla-codigo", label: "Talla" },
  { key: "peso", label: "Peso" },
  { key: "tamano", label: "Tamaño" },
  { key: "libre", label: "Personalizada" },
] as const;

const SIZE_CODE_OPTIONS = ["S", "M", "L", "XL", "XXL", "XXXL"];
const SIZE_DIMENSION_FIELDS = [
  { key: "height", label: "Alto" },
  { key: "width", label: "Ancho" },
  { key: "depth", label: "Profundidad" },
] as const;

// Base UI renderiza en <SelectValue> la etiqueta del item seleccionado, y
// solo si el Select recibe la lista de items. Sin esto el trigger muestra el
// valor crudo ("+504") en vez de la etiqueta ("Honduras (+504)").
const ATTRIBUTE_TYPE_ITEMS = ATTRIBUTE_TYPES.map((t) => ({
  label: t.label,
  value: t.key,
}));

const COLOR_ITEMS = COLOR_OPTIONS.map((color) => ({
  label: color,
  value: color,
}));

const WEIGHT_UNIT_ITEMS = [
  { label: "g", value: WEIGHT_UNITS[0] },
  { label: "kg", value: WEIGHT_UNITS[1] },
  { label: "oz", value: WEIGHT_UNITS[2] },
  { label: "lb", value: WEIGHT_UNITS[3] },
];

const SIZE_UNIT_ITEMS = [
  { label: "mm", value: SIZE_UNITS[0] },
  { label: "cm", value: SIZE_UNITS[1] },
  { label: "m", value: SIZE_UNITS[2] },
  { label: "pulg", value: SIZE_UNITS[3] },
];

/** Estado inicial del formulario: vacío para crear, o lo guardado para editar. */
function toFormState(variant: EditableVariant | null): VariantInput {
  if (!variant) {
    return {
      variantId: null,
      attributes: [{ name: "Color", value: "", type: "color" }],
      sku: "",
      price: "",
      discountType: "none",
      discountValue: "",
      madeToOrder: true,
      stock: "",
      stockUnit: "",
      active: true,
    };
  }
  const pairs = pairsFromAttributes(variant.attributes);
  return {
    variantId: variant.id,
    attributes:
      pairs.length > 0
        ? pairs
        : [{ name: "Color", value: "", type: "color" }],
    sku: variant.sku ?? "",
    price: (variant.price_cents / 100).toFixed(2),
    discountType: variant.discount_type,
    discountValue:
      variant.discount_type === "fixed"
        ? (variant.discount_value / 100).toFixed(2)
        : String(variant.discount_value),
    madeToOrder: variant.stock === null,
    stock: variant.stock === null ? "" : String(variant.stock),
    stockUnit: variant.stock_unit ?? "",
    active: variant.active,
  };
}

export function VariantManager({ productId, productVersion, currency, variants, pricingMode = "SHOW_ALL" }: Props) {
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
      toast.success("Variante creada. La presentación única se ocultó porque ya hay opciones.");
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

  // La variante sin atributos es la "presentación única" (precio base del
  // producto): se edita desde el campo Precio del editor, no aparece como item.
  const attributedVariants = variants.filter(
    (v) => Object.keys(v.attributes ?? {}).length > 0,
  );
  const sorted = [...attributedVariants].sort(
    (a, b) => a.final_price_cents - b.final_price_cents,
  );
  const editingVariantIndex = editing?.variantId
    ? sorted.findIndex((variant) => variant.id === editing.variantId)
    : -1;
  const editingVariantNumber =
    editingVariantIndex >= 0 ? editingVariantIndex + 1 : sorted.length + 1;
  const baseVariant = variants.find((v) => Object.keys(v.attributes ?? {}).length === 0);
  const basePrice = baseVariant ? (baseVariant.price_cents / 100).toFixed(2) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variantes</CardTitle>
        <CardDescription>
          Tamaños, colores, pesos, dimensiones, estilos, etc.  para cada producto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sorted.length > 0 ? (
          <ul className="space-y-2">
            {sorted.map((variant, index) => (
              <li
                key={variant.id}
                className="flex items-center gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Variante {index + 1}
                  </p>
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
                        ? variant.stock_unit
                          ? `${variant.stock} ${variant.stock_unit}`
                          : `${variant.stock} en stock`
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
        ) : null}

        {editing ? (
          <VariantForm
            key={editing.variantId ?? "new"}
            initial={editing}
            variantNumber={editingVariantNumber}
            currency={currency}
            basePrice={basePrice}
            busy={busy}
            pricingMode={pricingMode}
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
            Agregar variante
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function VariantForm({
  initial,
  variantNumber,
  currency,
  basePrice,
  busy,
  pricingMode = "SHOW_ALL",
  onCancel,
  onSave,
}: {
  initial: VariantInput;
  variantNumber: number;
  currency: string;
  basePrice: string;
  busy: boolean;
  pricingMode?: string;
  onCancel: () => void;
  onSave: (input: VariantInput) => void;
}) {
  const [form, setForm] = useState<VariantInput>(initial);
  const [showPrice, setShowPrice] = useState(initial.variantId !== null);
  const [showDiscount, setShowDiscount] = useState(initial.discountType !== "none");
  const [showSku, setShowSku] = useState(Boolean(initial.sku && initial.sku.trim() !== ""));

  // Solo usamos el primer par de atributos (tipo + valor) para esta variante.
  const pair: AttributePair = form.attributes[0] ?? {
    name: "",
    value: "",
    type: "color",
  };
  const customAttributes = pair.type === "libre";

  // Stock: se valida mientras se escribe, antes de enviar.
  let stockError: string | null = null;
  try {
    stockToStorage(form.stock, form.madeToOrder);
  } catch (err) {
    stockError = (err as Error).message;
  }

  // Precio con descuento calculado en vivo para la vista previa.
  const priceCents = parseAmountToCents(form.price);
  let discountedPriceCents: number | null = null;
  if (showDiscount && priceCents !== null && priceCents > 0) {
    if (form.discountType === "percent") {
      const pct = Number(form.discountValue.trim());
      if (Number.isInteger(pct) && pct >= 0 && pct <= 100) {
        const discountAmount = Math.trunc((priceCents * pct + 50) / 100);
        discountedPriceCents = Math.max(0, priceCents - discountAmount);
      }
    } else if (form.discountType === "fixed") {
      const cents = parseAmountToCents(form.discountValue);
      if (cents !== null && cents >= 0 && cents < priceCents) {
        discountedPriceCents = priceCents - cents;
      }
    }
  }

  const labelForType = (key: AttributeTypeKey): string =>
    ATTRIBUTE_TYPES.find((attributeType) => attributeType.key === key)?.label ?? "Color";

  const setType = (value: AttributeTypeKey) => {
    const nextAttribute: AttributePair = {
      name: value === "libre" ? "" : labelForType(value),
      value: "",
      type: value,
    };
    if (value === "peso") nextAttribute.unit = "kg";
    if (value === "tamano") {
      nextAttribute.unit = "cm";
      nextAttribute.dimensions = { height: "", width: "", depth: "" };
    }
    setForm((current) => ({
      ...current,
      attributes: [nextAttribute],
    }));
  };

  const setValue = (value: string) => {
    setForm((current) => ({
      ...current,
      attributes: [{ ...pair, value }],
    }));
  };

  const setUnit = (unit: string) => {
    setForm((current) => ({
      ...current,
      attributes: [{ ...(current.attributes[0] ?? pair), unit }],
    }));
  };

  const setDimension = (key: keyof SizeDimensions, value: string) => {
    setForm((current) => {
      const currentPair = current.attributes[0] ?? pair;
      return {
        ...current,
        attributes: [
          {
            ...currentPair,
            dimensions: {
              height: "",
              width: "",
              depth: "",
              ...currentPair.dimensions,
              [key]: value,
            },
          },
        ],
      };
    });
  };

  const getValueOptions = (type: AttributeTypeKey): readonly string[] => {
    switch (type) {
      case "color":
        return COLOR_OPTIONS;
      case "talla-codigo":
        return SIZE_CODE_OPTIONS;
      default:
        return [];
    }
  };

  const options = getValueOptions(pair.type ?? "color");
  const valueItems = useMemo(
    () => options.map((opt) => ({ label: opt, value: opt })),
    [options],
  );

  return (
    <form
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const next = { ...form };
        if (!showPrice && basePrice) {
          next.price = basePrice;
        }
        if (pricingMode === "REQUEST_ALL") {
          if (!next.price) next.price = basePrice || "0";
        }
        onSave(next);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Variante {variantNumber}
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="variant-active"
            checked={form.active}
            disabled={busy}
            onCheckedChange={(checked) => setForm({ ...form, active: checked })}
          />
          <Label htmlFor="variant-active">
            {form.active ? "Activa" : "Inactiva"}
          </Label>
        </div>
      </div>
      {/* Tipo y Valor de la variante */}
      <div className="space-y-2">
        <div
          className={
            customAttributes
              ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
              : pair.type === "tamano"
                ? "grid grid-cols-1 gap-3"
                : "grid grid-cols-2 gap-3"
          }
        >
          <div className="space-y-2">
            <Label htmlFor="variant-type">Tipo</Label>
            <Select
              items={ATTRIBUTE_TYPE_ITEMS}
              value={pair.type ?? "color"}
              onValueChange={(value) => {
                if (value && value !== pair.type) setType(value as AttributeTypeKey);
              }}
            >
              <SelectTrigger id="variant-type" className="w-full">
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
          {customAttributes ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="variant-custom-type">Nombre del tipo</Label>
                <Input
                  id="variant-custom-type"
                  value={pair.name}
                  placeholder="Ej. Material"
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      attributes: [{ ...pair, name: e.target.value }],
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-value">Valor</Label>
                <Input
                  id="variant-value"
                  value={pair.value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </>
          ) : pair.type === "color" ? (
            <div className="space-y-2">
              <Label htmlFor="variant-value">Valor</Label>
              <Select
                items={COLOR_ITEMS}
                value={pair.value}
                onValueChange={(value) => {
                  if (value) setValue(value);
                }}
              >
                <SelectTrigger id="variant-value" className="w-full">
                  <SelectValue placeholder="Seleccionar color" />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((color) => (
                    <SelectItem key={color} value={color}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border"
                          style={{ backgroundColor: COLOR_HEX[color] ?? color.toLowerCase() }}
                        />
                        {color}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : pair.type === "peso" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,auto)] gap-2">
              <div className="space-y-2">
                <Label htmlFor="variant-value">Valor</Label>
                <Input
                  id="variant-value"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="any"
                  required
                  placeholder="0.5"
                  value={pair.value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-weight-unit">Unidad</Label>
                <Select
                  items={WEIGHT_UNIT_ITEMS}
                  value={pair.unit ?? "kg"}
                  onValueChange={(value) => {
                    if (value) setUnit(value);
                  }}
                >
                  <SelectTrigger id="variant-weight-unit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEIGHT_UNIT_ITEMS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : pair.type === "tamano" ? null : (
            <div className="space-y-2">
              <Label htmlFor="variant-value">Valor</Label>
              <Select
                items={valueItems}
                value={pair.value}
                onValueChange={(value) => {
                  if (value) setValue(value);
                }}
              >
                <SelectTrigger id="variant-value" className="w-full">
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
            </div>
          )}
        </div>
        {!customAttributes && pair.type === "tamano" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SIZE_DIMENSION_FIELDS.map((dimension) => (
                <div key={dimension.key} className="space-y-2">
                  <Label htmlFor={`variant-${dimension.key}`}>
                    {dimension.label}
                  </Label>
                  <Input
                    id={`variant-${dimension.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="any"
                    required
                    placeholder="0"
                    value={pair.dimensions?.[dimension.key] ?? ""}
                    onChange={(e) =>
                      setDimension(dimension.key, e.target.value)
                    }
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="variant-size-unit">Unidad</Label>
                <Select
                  items={SIZE_UNIT_ITEMS}
                  value={pair.unit ?? "cm"}
                  onValueChange={(value) => {
                    if (value) setUnit(value);
                  }}
                >
                  <SelectTrigger id="variant-size-unit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_UNIT_ITEMS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-sm font-semibold">Opcionales</p>
        {/* Precio toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="variant-show-price"
              checked={showPrice}
              disabled={pricingMode === "REQUEST_ALL"}
              onCheckedChange={setShowPrice}
            />
            <Label htmlFor="variant-show-price">Precio específico</Label>
          </div>
          {showPrice ? (
            <div className="space-y-2">
              <Label htmlFor="variant-price" className="sr-only">
                Precio específico
              </Label>
              <Input
                id="variant-price"
                inputMode="decimal"
                placeholder={basePrice || "450.50"}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                disabled={pricingMode === "REQUEST_ALL"}
                className={pricingMode === "REQUEST_ALL" ? "opacity-50 cursor-not-allowed bg-muted" : ""}
              />
              {pricingMode === "REQUEST_ALL" ? (
                <p className="text-xs text-muted-foreground">Precio bloqueado por la configuración global de la tienda.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Descuento toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="variant-show-discount"
              checked={showDiscount}
              onCheckedChange={(checked) => {
                setShowDiscount(checked);
                setForm((current) => ({
                  ...current,
                  discountType: checked
                    ? current.discountType === "none"
                      ? "percent"
                      : current.discountType
                    : "none",
                  discountValue: checked ? current.discountValue : "",
                }));
              }}
            />
            <Label htmlFor="variant-show-discount">Descuento</Label>
          </div>
          {showDiscount ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="variant-discount-type">Tipo</Label>
                <select
                  id="variant-discount-type"
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as DiscountType, discountValue: "" })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Fijo</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-discount-value">
                  {form.discountType === "percent" ? "Porcentaje" : "Monto"}
                </Label>
                <Input
                  id="variant-discount-value"
                  inputMode="decimal"
                  placeholder={form.discountType === "percent" ? "10" : "50.00"}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          {showDiscount && discountedPriceCents !== null && priceCents !== null ? (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <span className="line-through text-muted-foreground mr-2">
                {formatMoney(priceCents, currency)}
              </span>
              <span className="font-semibold">{formatMoney(discountedPriceCents, currency)}</span>
            </div>
          ) : null}
        </div>

        {/* Controla si la variante tiene inventario */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="variant-inventory-mode"
              checked={!form.madeToOrder}
              onCheckedChange={(checked) => setForm({ ...form, madeToOrder: !checked })}
            />
            <Label htmlFor="variant-inventory-mode">Con Inventario</Label>
          </div>
          {!form.madeToOrder ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="variant-stock">Cantidad disponible</Label>
                  <Input
                    id="variant-stock"
                    inputMode="numeric"
                    aria-invalid={stockError !== null}
                    aria-describedby={stockError ? "variant-stock-error" : undefined}
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variant-stock-unit">Nombre de la cantidad (opcional)</Label>
                  <Input
                    id="variant-stock-unit"
                    maxLength={40}
                    value={form.stockUnit}
                    onChange={(e) => setForm({ ...form, stockUnit: e.target.value })}
                    aria-describedby="variant-stock-unit-hint"
                  />
                  <p id="variant-stock-unit-hint" className="text-xs text-muted-foreground">
                    Ej.: bolsas, sacos o cajas.
                  </p>
                </div>
              </div>
              {stockError ? (
                <p id="variant-stock-error" className="text-xs text-destructive" role="alert">
                  {stockError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Código propio toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="variant-show-sku"
              checked={showSku}
              onCheckedChange={(checked) => {
                setShowSku(checked);
                if (!checked) setForm((current) => ({ ...current, sku: "" }));
              }}
            />
            <Label htmlFor="variant-show-sku">Código propio</Label>
          </div>
          {showSku ? (
            <div className="space-y-2">
              <Input
                id="variant-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Si posee un código identificativo externo.
              </p>
            </div>
          ) : null}
        </div>

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
