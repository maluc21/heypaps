"use client";

/**
 * Ajustes de la tienda (plan §2.6, §2.7 y §2.8).
 *
 * Solo el owner puede cambiar los ajustes; un editor ve el formulario en modo
 * lectura. El logo se sube al DAM con el mismo flujo que las imágenes de los
 * productos.
 */

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StoreLogoManager } from "@/components/store-logo-manager";
import { SocialIcon, type SocialPlatform as SocialPlatformKey } from "@/components/social-icons";
import {
  publishStore,
  regenerateStoreSlug,
  setStoreLogo,
  unpublishStore,
  updateStoreSettings,
} from "@/lib/actions/store";

export type StoreSettingsData = {
  id: string;
  name: string;
  description: string | null;
  whatsapp_e164: string | null;
  currency: string;
  secondary_currency: string | null;
  fx_rate: number | null;
  logo_file_id: string | null;
  slug: string;
  status: "draft" | "published" | "suspended";
  plan_code: string;
  appearance: Record<string, unknown> | null;
  pricing_mode: string;
  address: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
};

export type PlanSummary = {
  max_products: number;
  max_images_per_product: number;
  max_storage_bytes: number;
  remove_brand: boolean;
  custom_domain: boolean;
};

export type UsageSummary = {
  products: number;
  maxImagesUsed: number;
  bytesUsed: number;
};

type Props = {
  store: StoreSettingsData;
  role: string;
  plan: PlanSummary;
  usage: UsageSummary;
};

function subscribeToNothing(): () => void {
  return () => {};
}

const CURRENCIES = [
  { code: "ARS", label: "Peso argentino (ARS)" },
  { code: "BOB", label: "Boliviano (BOB)" },
  { code: "BRL", label: "Real brasileño (BRL)" },
  { code: "CLP", label: "Peso chileno (CLP)" },
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "CRC", label: "Colón costarricense (CRC)" },
  { code: "CUP", label: "Peso cubano (CUP)" },
  { code: "DOP", label: "Peso dominicano (DOP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GTQ", label: "Quetzal guatemalteco (GTQ)" },
  { code: "HTG", label: "Gourde haitiano (HTG)" },
  { code: "HNL", label: "Lempira (HNL)" },
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "NIO", label: "Córdoba nicaragüense (NIO)" },
  { code: "PAB", label: "Balboa panameño (PAB)" },
  { code: "PEN", label: "Sol peruano (PEN)" },
  { code: "PYG", label: "Guaraní paraguayo (PYG)" },
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "UYU", label: "Peso uruguayo (UYU)" },
  { code: "VES", label: "Bolívar venezolano (VES)" },
];

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "tuusuario" },
  { key: "facebook", label: "Facebook", placeholder: "tupagina" },
  { key: "tiktok", label: "TikTok", placeholder: "tuusuario" },
  { key: "linkedin", label: "LinkedIn", placeholder: "tuempresa" },
  { key: "youtube", label: "YouTube", placeholder: "tucanal" },
  { key: "x", label: "X (Twitter)", placeholder: "tuusuario" },
] as const;

type SocialPlatform = SocialPlatformKey;

const COUNTRIES_BY_REGION = {
  América: [
    { name: "Antigua y Barbuda", dialCode: "+1268" },
    { name: "Argentina", dialCode: "+54" },
    { name: "Bahamas", dialCode: "+1242" },
    { name: "Barbados", dialCode: "+1246" },
    { name: "Belice", dialCode: "+501" },
    { name: "Bolivia", dialCode: "+591" },
    { name: "Brasil", dialCode: "+55" },
    { name: "Canadá", dialCode: "+1" },
    { name: "Chile", dialCode: "+56" },
    { name: "Colombia", dialCode: "+57" },
    { name: "Costa Rica", dialCode: "+506" },
    { name: "Cuba", dialCode: "+53" },
    { name: "Dominica", dialCode: "+1767" },
    { name: "Ecuador", dialCode: "+593" },
    { name: "El Salvador", dialCode: "+503" },
    { name: "Estados Unidos", dialCode: "+1" },
    { name: "Granada", dialCode: "+1473" },
    { name: "Guatemala", dialCode: "+502" },
    { name: "Guyana", dialCode: "+592" },
    { name: "Haití", dialCode: "+509" },
    { name: "Honduras", dialCode: "+504" },
    { name: "Jamaica", dialCode: "+1876" },
    { name: "México", dialCode: "+52" },
    { name: "Nicaragua", dialCode: "+505" },
    { name: "Panamá", dialCode: "+507" },
    { name: "Paraguay", dialCode: "+595" },
    { name: "Perú", dialCode: "+51" },
    { name: "República Dominicana", dialCode: "+1809" },
    { name: "San Cristóbal y Nieves", dialCode: "+1869" },
    { name: "San Vicente y las Granadinas", dialCode: "+1784" },
    { name: "Santa Lucía", dialCode: "+1758" },
    { name: "Surinam", dialCode: "+597" },
    { name: "Trinidad y Tobago", dialCode: "+1868" },
    { name: "Uruguay", dialCode: "+598" },
    { name: "Venezuela", dialCode: "+58" },
  ],
  Europa: [
    { name: "Albania", dialCode: "+355" },
    { name: "Alemania", dialCode: "+49" },
    { name: "Andorra", dialCode: "+376" },
    { name: "Armenia", dialCode: "+374" },
    { name: "Austria", dialCode: "+43" },
    { name: "Azerbaiyán", dialCode: "+994" },
    { name: "Bélgica", dialCode: "+32" },
    { name: "Bielorrusia", dialCode: "+375" },
    { name: "Bosnia y Herzegovina", dialCode: "+387" },
    { name: "Bulgaria", dialCode: "+359" },
    { name: "Chipre", dialCode: "+357" },
    { name: "Ciudad del Vaticano", dialCode: "+39" },
    { name: "Croacia", dialCode: "+385" },
    { name: "Dinamarca", dialCode: "+45" },
    { name: "Eslovaquia", dialCode: "+421" },
    { name: "Eslovenia", dialCode: "+386" },
    { name: "España", dialCode: "+34" },
    { name: "Estonia", dialCode: "+372" },
    { name: "Finlandia", dialCode: "+358" },
    { name: "Francia", dialCode: "+33" },
    { name: "Georgia", dialCode: "+995" },
    { name: "Grecia", dialCode: "+30" },
    { name: "Hungría", dialCode: "+36" },
    { name: "Irlanda", dialCode: "+353" },
    { name: "Islandia", dialCode: "+354" },
    { name: "Italia", dialCode: "+39" },
    { name: "Kosovo", dialCode: "+383" },
    { name: "Letonia", dialCode: "+371" },
    { name: "Liechtenstein", dialCode: "+423" },
    { name: "Lituania", dialCode: "+370" },
    { name: "Luxemburgo", dialCode: "+352" },
    { name: "Macedonia del Norte", dialCode: "+389" },
    { name: "Malta", dialCode: "+356" },
    { name: "Moldavia", dialCode: "+373" },
    { name: "Mónaco", dialCode: "+377" },
    { name: "Montenegro", dialCode: "+382" },
    { name: "Noruega", dialCode: "+47" },
    { name: "Países Bajos", dialCode: "+31" },
    { name: "Polonia", dialCode: "+48" },
    { name: "Portugal", dialCode: "+351" },
    { name: "Reino Unido", dialCode: "+44" },
    { name: "República Checa", dialCode: "+420" },
    { name: "Rumanía", dialCode: "+40" },
    { name: "Rusia", dialCode: "+7" },
    { name: "San Marino", dialCode: "+378" },
    { name: "Serbia", dialCode: "+381" },
    { name: "Suecia", dialCode: "+46" },
    { name: "Suiza", dialCode: "+41" },
    { name: "Turquía", dialCode: "+90" },
    { name: "Ucrania", dialCode: "+380" },
  ],
} as const;

const PHONE_COUNTRIES = Object.values(COUNTRIES_BY_REGION).flat();
const PHONE_COUNTRIES_BY_LONGEST_CODE = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

function splitPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const country = PHONE_COUNTRIES_BY_LONGEST_CODE.find((item) =>
    digits.startsWith(item.dialCode.slice(1)),
  );

  return country
    ? { dialCode: country.dialCode, number: digits.slice(country.dialCode.length - 1) }
    : { dialCode: "+504", number: digits };
}

export function StoreSettingsForm({ store, role, plan, usage }: Props) {
  const router = useRouter();
  const isOwner = role === "owner";

  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const storedWhatsapp = store.whatsapp_e164 ?? "";
  const initialPhone = splitPhoneNumber(storedWhatsapp);
  const [whatsappDialCode, setWhatsappDialCode] = useState<string>(initialPhone.dialCode);
  const [whatsappNumber, setWhatsappNumber] = useState(initialPhone.number);
  const [whatsappDirty, setWhatsappDirty] = useState(false);
  const storedIdent = (store.appearance?.identification as Record<string, string | null>) ?? {};
  const [address, setAddress] = useState(storedIdent.address ?? "");
  const [city, setCity] = useState(storedIdent.city ?? "");
  const [country, setCountry] = useState(storedIdent.country ?? "");
  const [email, setEmail] = useState(storedIdent.email ?? "");
  const [currency, setCurrency] = useState(store.currency);
  const [secondaryCurrency, setSecondaryCurrency] = useState(store.secondary_currency ?? "");
  const [fxRate, setFxRate] = useState(store.fx_rate ? String(store.fx_rate) : "");
  const [logo, setLogo] = useState(store.logo_file_id);
  const [slug, setSlug] = useState(store.slug);
  const [pricingMode, setPricingMode] = useState(store.pricing_mode ?? "SHOW_ALL");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);

  const storedSocial = (store.appearance?.socialLinks as Record<SocialPlatform, string | null>) ?? {};
  const [socialLinks, setSocialLinks] = useState<Record<SocialPlatform, string>>(
    SOCIAL_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: storedSocial[p.key] ?? "" }), {} as Record<SocialPlatform, string>)
  );

  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
  const publicUrl = origin ? `${origin}/s/${slug}` : `/s/${slug}`;

  const persist = async (overrides: Partial<{
    name: string;
    description: string;
    whatsapp: string;
    currency: string;
    secondaryCurrency: string;
    fxRate: string;
    socialLinks: Record<SocialPlatform, string>;
    pricingMode: string;
    address: string;
    city: string;
    country: string;
    email: string;
  }> = {}) => {
    if (!isOwner || savingRef.current) return;

    const nextName = overrides.name ?? name;
    const nextDescription = overrides.description ?? description;
    const currentWhatsapp = whatsappNumber ? `${whatsappDialCode}${whatsappNumber}` : "";
    const nextWhatsapp = overrides.whatsapp ??
      (whatsappDirty ? currentWhatsapp : storedWhatsapp);
    const nextAddress = overrides.address ?? address;
    const nextCity = overrides.city ?? city;
    const nextCountry = overrides.country ?? country;
    const nextEmail = overrides.email ?? email;
    const nextCurrency = overrides.currency ?? currency;
    const nextSecondary = overrides.secondaryCurrency ?? secondaryCurrency;
    const nextFxRate = overrides.fxRate ?? fxRate;
    const nextSocial = overrides.socialLinks ?? socialLinks;
    const nextPricingMode = overrides.pricingMode ?? pricingMode;

    if (!nextName.trim()) {
      toast.error("El nombre de la tienda es obligatorio.");
      return;
    }
    if (nextSecondary && nextSecondary === nextCurrency) {
      toast.error("La segunda moneda debe ser distinta a la principal.");
      return;
    }
    if (nextSecondary) {
      const n = Number(nextFxRate);
      if (!nextFxRate || Number.isNaN(n) || n <= 0) {
        toast.error("La tasa de cambio debe ser un número mayor a 0.");
        return;
      }
    }

    if (overrides.name !== undefined) setName(overrides.name);
    if (overrides.description !== undefined) setDescription(overrides.description);
    if (overrides.address !== undefined) setAddress(overrides.address);
    if (overrides.city !== undefined) setCity(overrides.city);
    if (overrides.country !== undefined) setCountry(overrides.country);
    if (overrides.email !== undefined) setEmail(overrides.email);
    if (overrides.currency !== undefined) setCurrency(overrides.currency);
    if (overrides.secondaryCurrency !== undefined) setSecondaryCurrency(overrides.secondaryCurrency);
    if (overrides.fxRate !== undefined) setFxRate(overrides.fxRate);
    if (overrides.socialLinks !== undefined) setSocialLinks(overrides.socialLinks);
    if (overrides.pricingMode !== undefined) setPricingMode(overrides.pricingMode);

    const socialLinksObj = SOCIAL_PLATFORMS.reduce((acc, p) => {
      const val = nextSocial[p.key]?.trim();
      if (val) acc[p.key] = val;
      return acc;
    }, {} as Record<string, string>);

    const payload = {
      name: nextName,
      description: nextDescription,
      whatsapp: nextWhatsapp,
      address: nextAddress,
      city: nextCity,
      country: nextCountry,
      email: nextEmail,
      currency: nextCurrency,
      secondaryCurrency: nextSecondary || null,
      fxRate: nextSecondary ? Number(nextFxRate) : null,
      socialLinks: Object.keys(socialLinksObj).length > 0 ? socialLinksObj : undefined,
      pricingMode: nextPricingMode,
    };

    savingRef.current = true;
    setSaving(true);
    const promise = updateStoreSettings(store.id, payload).then((res) => {
      if (res.error) throw new Error(res.error);
      return res;
    });
    toast.promise(promise, {
      loading: "Guardando…",
      success: "Ajustes guardados.",
      error: (e: unknown) => (e instanceof Error ? e.message : "No se pudieron guardar los ajustes."),
    });

    let ok = true;
    try {
      await promise;
    } catch {
      ok = false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (ok) router.refresh();
  };

  const saveLogo = async (fileId: string | null) => {
    const res = await setStoreLogo(store.id, fileId);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setLogo(fileId);
    router.refresh();
  };

  const togglePublished = async () => {
    setBusy(true);
    const res =
      store.status === "published"
        ? await unpublishStore(store.id)
        : await publishStore(store.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      store.status === "published" ? "Catálogo despublicado." : "¡Catálogo publicado!",
    );
    router.refresh();
  };

  const changeSlug = async () => {
    const next = slug.trim();
    if (next === store.slug) return;
    if (!window.confirm("Cambiar el link rompe los enlaces ya compartidos por WhatsApp. ¿Continuar?")) {
      setSlug(store.slug);
      return;
    }
    setBusy(true);
    const res = await regenerateStoreSlug(store.id, next);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      setSlug(store.slug);
      return;
    }
    toast.success("Link actualizado.");
    router.refresh();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado.");
    } catch {
      toast.error("No se pudo copiar el link.");
    }
  };

  const storagePercent = Math.min(
    100,
    Math.round((usage.bytesUsed / Math.max(1, plan.max_storage_bytes)) * 100),
  );
  const productsPercent = Math.min(
    100,
    Math.round((usage.products / Math.max(1, plan.max_products)) * 100),
  );
  const imagesPercent = Math.min(
    100,
    Math.round((usage.maxImagesUsed / Math.max(1, plan.max_images_per_product)) * 100),
  );

  return (
    <div className="space-y-4 px-2 py-3 pb-24 sm:p-4 sm:pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ajustes</h2>
        <Badge variant={store.status === "published" ? "default" : "secondary"}>
          {store.status === "published" ? "Publicado" : "Borrador"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu Catálogo</CardTitle>
          <CardDescription>
            {isOwner
              ? "Estos datos aparecen en tu catálogo público."
              : "Solo el dueño de la tienda puede cambiar estos datos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-name">Nombre</Label>
            <Input
              id="store-name"
              value={name}
              disabled={!isOwner || saving}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => persist()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-description">Descripción</Label>
            <Textarea
              id="store-description"
              value={description}
              disabled={!isOwner || saving}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => persist()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-whatsapp">WhatsApp</Label>
            <div className="grid grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)] gap-2">
              <select
                aria-label="País y prefijo telefónico"
                value={whatsappDialCode}
                disabled={!isOwner || saving}
                onChange={(e) => {
                  const dialCode = e.target.value;
                  setWhatsappDialCode(dialCode);
                  setWhatsappDirty(true);
                  persist({
                    whatsapp: whatsappNumber ? `${dialCode}${whatsappNumber}` : "",
                  });
                }}
                className="min-h-11 min-w-0 rounded-md border border-input bg-background px-2 text-base"
              >
                {PHONE_COUNTRIES.map((item, index) => (
                  <option key={`${item.name}-${index}`} value={item.dialCode}>
                    {item.dialCode} {item.name}
                  </option>
                ))}
              </select>
              <Input
                id="store-whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={whatsappNumber}
                disabled={!isOwner || saving}
                placeholder="1234 5678"
                onChange={(e) => {
                  setWhatsappNumber(e.target.value.replace(/\D/g, ""));
                  setWhatsappDirty(true);
                }}
                onBlur={() => persist()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sin espacios ni guiones.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link público</CardTitle>
          <CardDescription>Enlace directo a tu catálogo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copyLink}>
              Copiar
            </Button>
          </div>

          {isOwner ? (
            <div className="space-y-2">
              <Label htmlFor="store-slug">Parte final del link</Label>
              <div className="flex gap-2">
                <Input
                  id="store-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || slug === store.slug}
                  onClick={changeSlug}
                >
                  Cambiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cambiarlo rompe los enlaces que ya compartiste.
              </p>
            </div>
          ) : null}

          {isOwner ? (
            <Button
              variant={store.status === "published" ? "outline" : "default"}
              disabled={busy}
              onClick={togglePublished}
              className="w-full"
            >
              {store.status === "published" ? "Despublicar catálogo" : "Publicar catálogo"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precios</CardTitle>
          <CardDescription>Moneda de tu catálogo y conversión opcional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-currency">Moneda principal</Label>
            <select
              id="store-currency"
              value={currency}
              disabled={!isOwner || saving}
              onChange={(e) => {
                const v = e.target.value;
                setCurrency(v);
                persist({ currency: v });
              }}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-secondary">Segunda moneda (opcional)</Label>
            <select
              id="store-secondary"
              value={secondaryCurrency}
              disabled={!isOwner || saving}
              onChange={(e) => {
                const v = e.target.value;
                setSecondaryCurrency(v);
                persist({ secondaryCurrency: v });
              }}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">Ninguna</option>
              {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {secondaryCurrency ? (
            <div className="space-y-2">
              <Label htmlFor="store-fx">
                1 {currency} = cuántos {secondaryCurrency}
              </Label>
              <Input
                id="store-fx"
                type="number"
                step="any"
                value={fxRate}
                disabled={!isOwner || saving}
                inputMode="decimal"
                placeholder="25.50"
                onChange={(e) => setFxRate(e.target.value)}
                onBlur={() => persist()}
              />
              <p className="text-xs text-muted-foreground">
                Tipo de cambio que usas para mostrar precios en la segunda moneda.
              </p>
            </div>
          ) : null}

          <fieldset className="space-y-3 pt-2">
            <legend className="text-sm font-medium">Visibilidad de precios</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { value: "SHOW_ALL", title: "Mostrar precio en todos los productos" },
                { value: "REQUEST_ALL", title: "Sin precio en todos los productos. A solicitud." },
                { value: "CUSTOM", title: "Personalizado por producto" },
              ].map((option) => (
                <label key={option.value} className="min-w-0 cursor-pointer">
                  <input
                    type="radio"
                    name="pricing-mode"
                    value={option.value}
                    checked={pricingMode === option.value}
                    disabled={!isOwner || saving}
                    onChange={() => {
                      setPricingMode(option.value);
                      persist({ pricingMode: option.value });
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-14 items-center rounded-xl border border-border bg-background p-3 text-sm font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                    {option.title}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identificación</CardTitle>
          <CardDescription>Datos de tu negocio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-address">Dirección</Label>
            <Input
              id="store-address"
              value={address}
              disabled={!isOwner || saving}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => persist()}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="store-city">Ciudad</Label>
              <Input
                id="store-city"
                value={city}
                disabled={!isOwner || saving}
                onChange={(e) => setCity(e.target.value)}
                onBlur={() => persist()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-country">País</Label>
              <select
                id="store-country"
                value={country}
                disabled={!isOwner || saving}
                onChange={(e) => {
                  const v = e.target.value;
                  setCountry(v);
                  persist({ country: v });
                }}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              >
                {!country ? <option value="">Selecciona un país</option> : null}
                {country && !PHONE_COUNTRIES.some((item) => item.name === country) ? (
                  <option value={country}>{country}</option>
                ) : null}
                {Object.entries(COUNTRIES_BY_REGION).map(([region, countries]) => (
                  <optgroup key={region} label={region}>
                    {countries.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-email">Correo electrónico</Label>
            <Input
              id="store-email"
              type="email"
              value={email}
              disabled={!isOwner || saving}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => persist()}
            />
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            {isOwner ? (
              <StoreLogoManager
                storeId={store.id}
                logo={logo ?? null}
                storeName={name}
                onChange={saveLogo}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sin logo.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redes Sociales</CardTitle>
          <CardDescription>
            Pega los enlaces de tus perfiles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            return (
              <div key={platform.key} className="space-y-2">
                <Label htmlFor={`social-${platform.key}`}>{platform.label}</Label>
                <div className="flex gap-2 items-center">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <SocialIcon platform={platform.key} className="size-4" />
                  </span>
                  <Input
                    id={`social-${platform.key}`}
                    value={socialLinks[platform.key]}
                    disabled={!isOwner || saving}
                    placeholder={`https://${platform.label.toLowerCase()}.com/${platform.placeholder}`}
                    onChange={(e) => setSocialLinks((prev) => ({ ...prev, [platform.key]: e.target.value }))}
                    onBlur={() => persist()}
                    className="flex-1"
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tu plan</CardTitle>
          <CardDescription>
            Plan {store.plan_code === "pro" ? "Pro" : "Gratis"} · uso actual
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Productos</span>
              <span>
                {usage.products} de {plan.max_products} ({productsPercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${productsPercent}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Imágenes por producto</span>
              <span>
                {usage.maxImagesUsed} de {plan.max_images_per_product} ({imagesPercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${imagesPercent}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Almacenamiento</span>
              <span>
                {formatBytes(usage.bytesUsed)} de {formatBytes(plan.max_storage_bytes)} ({storagePercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            {storagePercent >= 80 ? (
              <p className="text-xs text-destructive">
                Vas al {storagePercent}% de tu cuota. Considera el plan Pro.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );

}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

