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
                  <Select value={whatsappCode} onValueChange={setWhatsappCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+504">Honduras (+504)</SelectItem>
                      <SelectItem value="+1">Estados Unidos / Canadá (+1)</SelectItem>
                      <SelectItem value="+52">México (+52)</SelectItem>
                      <SelectItem value="+54">Argentina (+54)</SelectItem>
                      <SelectItem value="+56">Chile (+56)</SelectItem>
                      <SelectItem value="+57">Colombia (+57)</SelectItem>
                      <SelectItem value="+58">Venezuela (+58)</SelectItem>
                      <SelectItem value="+55">Brasil (+55)</SelectItem>
                      <SelectItem value="+51">Perú (+51)</SelectItem>
                      <SelectItem value="+501">Belice (+501)</SelectItem>
                      <SelectItem value="+502">Guatemala (+502)</SelectItem>
                      <SelectItem value="+503">El Salvador (+503)</SelectItem>
                      <SelectItem value="+505">Nicaragua (+505)</SelectItem>
                      <SelectItem value="+506">Costa Rica (+506)</SelectItem>
                      <SelectItem value="+507">Panamá (+507)</SelectItem>
                      <SelectItem value="+509">Haití (+509)</SelectItem>
                      <SelectItem value="+31">Países Bajos (+31)</SelectItem>
                      <SelectItem value="+32">Bélgica (+32)</SelectItem>
                      <SelectItem value="+33">Francia (+33)</SelectItem>
                      <SelectItem value="+34">España (+34)</SelectItem>
                      <SelectItem value="+39">Italia (+39)</SelectItem>
                      <SelectItem value="+41">Suiza (+41)</SelectItem>
                      <SelectItem value="+44">Reino Unido (+44)</SelectItem>
                      <SelectItem value="+49">Alemania (+49)</SelectItem>
                      <SelectItem value="+53">Cuba (+53)</SelectItem>
                      <SelectItem value="+61">Australia (+61)</SelectItem>
                      <SelectItem value="+81">Japón (+81)</SelectItem>
                      <SelectItem value="+86">China (+86)</SelectItem>
                      <SelectItem value="+91">India (+91)</SelectItem>
                      <SelectItem value="+971">Emiratos Árabes (+971)</SelectItem>
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
          <CardFooter className="space-y-2">
            {published ? (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Tu catálogo está publicado. Este es tu link:
                </p>
                <p className="break-all rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs">
                  {catalogUrl}
                </p>
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
              </>
            ) : (
              <>
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
              </>
            )}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
