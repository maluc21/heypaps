'use client'

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createStore, createFirstProduct, publishStore } from "@/lib/actions/store";
import { normalizeSlug, RESERVED_SLUGS, formatMoney } from "@/lib/utils";
import { parseAmountToCents } from "@/lib/money";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "tienda" | "producto" | "listo";

// Base UI renderiza en <SelectValue> la etiqueta del item seleccionado, y
// solo si el Select recibe la lista de items. Sin esto el trigger muestra el
// valor crudo ("+504") en vez de la etiqueta ("Honduras (+504)").
const WHATSAPP_CODES = [
  { value: "+504", label: "Honduras (+504)" },
  { value: "+1", label: "Estados Unidos / Canadá (+1)" },
  { value: "+52", label: "México (+52)" },
  { value: "+54", label: "Argentina (+54)" },
  { value: "+56", label: "Chile (+56)" },
  { value: "+57", label: "Colombia (+57)" },
  { value: "+58", label: "Venezuela (+58)" },
  { value: "+55", label: "Brasil (+55)" },
  { value: "+51", label: "Perú (+51)" },
  { value: "+501", label: "Belice (+501)" },
  { value: "+502", label: "Guatemala (+502)" },
  { value: "+503", label: "El Salvador (+503)" },
  { value: "+505", label: "Nicaragua (+505)" },
  { value: "+506", label: "Costa Rica (+506)" },
  { value: "+507", label: "Panamá (+507)" },
  { value: "+509", label: "Haití (+509)" },
  { value: "+31", label: "Países Bajos (+31)" },
  { value: "+32", label: "Bélgica (+32)" },
  { value: "+33", label: "Francia (+33)" },
  { value: "+34", label: "España (+34)" },
  { value: "+39", label: "Italia (+39)" },
  { value: "+41", label: "Suiza (+41)" },
  { value: "+44", label: "Reino Unido (+44)" },
  { value: "+49", label: "Alemania (+49)" },
  { value: "+53", label: "Cuba (+53)" },
  { value: "+61", label: "Australia (+61)" },
  { value: "+81", label: "Japón (+81)" },
  { value: "+86", label: "China (+86)" },
  { value: "+91", label: "India (+91)" },
  { value: "+971", label: "Emiratos Árabes (+971)" },
];

const CURRENCIES = [
  { value: "HNL", label: "Lempiras (HNL)" },
  { value: "USD", label: "Dólares (USD)" },
];

/** El origin no cambia durante la vida de la página: sin suscripciones. */
function subscribeToNothing(): () => void {
  return () => {};
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("tienda");
  const [storeId, setStoreId] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  // El origin solo existe en el navegador. useSyncExternalStore da "" en el
  // servidor y el origin real tras hidratar, sin desajustar la hidratación.
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [whatsappCode, setWhatsappCode] = useState("+504");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [currency, setCurrency] = useState("HNL");

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const priceCents = parseAmountToCents(price);

  const slugFromName = () => normalizeSlug(name);

  const handleCreateStore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("whatsapp", `${whatsappCode}${whatsappNumber}`);
    const result = await createStore(formData);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.storeId) {
      setStoreId(result.storeId);
      setStoreSlug(result.slug ?? slug);
      setStep("producto");
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    const result = await publishStore(storeId);
    setPublishing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPublished(true);
    toast.success("¡Catálogo publicado!");
  };

  const catalogUrl = origin ? `${origin}/s/${storeSlug}` : `/s/${storeSlug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(catalogUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar el link");
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
          <CardTitle>Crea tu Catálogo</CardTitle>
          <CardDescription>
            {step === "tienda"
              ? "Completa los datos para comenzar."
              : step === "producto"
                ? "Añade tu primer producto."
                : "Tu tienda está lista."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "tienda" && (
            <form onSubmit={handleCreateStore} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Enlace personalizado</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={slugFromName() || "mi-tienda"}
                  required
                />
                <p className="text-xs font-bold text-muted-foreground mt-1">
                  {slug ? `heypaps.com/${slug}` : ""}
                </p>
                {RESERVED_SLUGS.has(slug) && (
                  <p className="text-xs text-destructive">Este enlace está reservado.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">Número de WhatsApp</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    items={WHATSAPP_CODES}
                    value={whatsappCode}
                    onValueChange={(value) => setWhatsappCode(value ?? "+504")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WHATSAPP_CODES.map((code) => (
                        <SelectItem key={code.value} value={code.value}>
                          {code.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    <Input
                    id="whatsapp-number"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="31234567"
                    required
                    className="pl-3"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Sin guiones ni espacios. Solo números.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  items={CURRENCIES}
                  value={currency}
                  onValueChange={(value) => setCurrency(value ?? "HNL")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
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
          <CardFooter className="space-y-2 p-4">
            {published ? (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Tu catálogo está publicado. Este es tu link:
                </p>
                <p className="break-all rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs">
                  {catalogUrl}
                </p>
                <div className="flex flex-col gap-2 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyLink}
                    className="w-full"
                  >
                    Copiar link
                  </Button>
                  <Button
                    type="button"
                    onClick={() => router.push(`/s/${storeSlug}`)}
                    className="w-full"
                  >
                    Ver mi catálogo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.replace("/panel")}
                    className="w-full"
                  >
                    Ir al panel
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 w-full">
                <Button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full"
                >
                  {publishing ? "Publicando…" : "Publicar y ver mi catálogo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="w-full"
                >
                  Copiar link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.replace("/panel")}
                  className="w-full"
                >
                  Ir al panel
                </Button>
                <p className="pt-2 text-center text-xs text-muted-foreground">
                  Tu catálogo sigue oculto hasta que lo publiques.
                </p>
              </div>
            )}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
