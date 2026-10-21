'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { updateProduct } from "@/lib/actions/product";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

type ProductEditorFormProps = { product: Product };

export function ProductEditorForm({ product }: ProductEditorFormProps) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [active, setActive] = useState(product.active);
  const [paused, setPaused] = useState(product.paused);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await updateProduct(product.id, product.version, {
      name,
      description,
      active,
      paused,
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
          <div className="flex items-center gap-2">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active">Visible en el catálogo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="paused" checked={paused} onCheckedChange={setPaused} />
            <Label htmlFor="paused">Pausado temporalmente</Label>
          </div>
          <div className="flex gap-2">
            <Badge variant={product.paused ? "secondary" : "default"}>
              Estado: {product.paused ? "Pausado" : product.active ? "Activo" : "Oculto"}
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
