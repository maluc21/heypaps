'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStore, createFirstProduct } from "@/lib/actions/store";
import { normalizeSlug, RESERVED_SLUGS, formatMoney } from "@/lib/utils";
import { parseAmountToCents } from "@/lib/money";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "tienda" | "producto" | "listo";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("tienda");
  const [storeId, setStoreId] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currency, setCurrency] = useState("HNL");

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const priceCents = parseAmountToCents(price);

  const slugFromName = () => normalizeSlug(name);

  const handleCreateStore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = await createStore(formData);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.storeId) {
      setStoreId(result.storeId);
      setStep("producto");
    }
  };

  const handleCreateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("store_id", storeId);
    const result = await createFirstProduct(formData);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setStep("listo");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md space-y-4">
        <CardHeader className="text-center">
          <CardTitle>Crear tu tienda</CardTitle>
          <CardDescription>
            {step === "tienda"
              ? "Dale un nombre y una dirección a tu catálogo."
              : step === "producto"
                ? "Añade tu primer producto."
                : "Tu tienda está lista."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "tienda" && (
            <form onSubmit={handleCreateStore} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la tienda</Label>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(slugFromName());
                  }}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Dirección (slug)</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={slugFromName() || "mi-tienda"}
                  required
                />
                {RESERVED_SLUGS.has(slug) && (
                  <p className="text-xs text-destructive">Esta dirección está reservada.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" name="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+501 3123 4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HNL">Lempiras (HNL)</SelectItem>
                    <SelectItem value="USD">Dólares (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <input type="hidden" name="currency" value={currency} />
              <Button type="submit" className="w-full">Continuar</Button>
            </form>
          )}
          {step === "producto" && (
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="productName">Nombre del producto</Label>
                <Input id="productName" name="name" value={productName} onChange={(e) => setProductName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Precio ({currency === "HNL" ? "L" : "USD"})</Label>
                <Input
                  id="price"
                  name="price"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="450.00"
                  required
                />
                {priceCents !== null && (
                  <p className="text-xs text-muted-foreground">{formatMoney(priceCents, currency)}</p>
                )}
                {price !== "" && priceCents === null && (
                  <p className="text-xs text-destructive">Usa solo números con punto decimal, ej. 450 o 450.50.</p>
                )}
              </div>
              <Button type="submit" className="w-full">Crear producto y finalizar</Button>
              <Button type="button" variant="outline" onClick={() => setStep("tienda")} className="w-full">
                Volver
              </Button>
            </form>
          )}
        </CardContent>
        {step === "listo" && (
          <CardFooter>
            <Button onClick={() => router.replace("/panel")} className="w-full">
              Ir al panel
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
