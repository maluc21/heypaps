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
  { code: "HNL", label: "Lempira (HNL)" },
  { code: "USD", label: "Dólar (USD)" },
];

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "tuusuario" },
  { key: "facebook", label: "Facebook", placeholder: "tupagina" },
  { key: "tiktok", label: "TikTok", placeholder: "tuusuario" },
  { key: "linkedin", label: "LinkedIn", placeholder: "tuempresa" },
  { key: "youtube", label: "YouTube", placeholder: "tucanal" },
  { key: "x", label: "X (Twitter)", placeholder: "tuusuario" },
] as const;

type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];

export function StoreSettingsForm({ store, role, plan, usage }: Props) {
  const router = useRouter();
  const isOwner = role === "owner";

  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const [whatsapp, setWhatsapp] = useState(store.whatsapp_e164 ?? "");
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
    const nextWhatsapp = overrides.whatsapp ?? whatsapp;
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
    if (overrides.whatsapp !== undefined) setWhatsapp(overrides.whatsapp);
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

  return (
    <div className="space-y-4 p-4 pb-24">
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
            <Input
              id="store-whatsapp"
              value={whatsapp}
              disabled={!isOwner || saving}
              placeholder="+504 1234 5678"
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={() => persist()}
            />
            <p className="text-xs text-muted-foreground">
              Se guarda en formato internacional. Es a donde caen las ventas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link público</CardTitle>
          <CardDescription>Compártelo por WhatsApp con tus clientes.</CardDescription>
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

          <div className="space-y-3 pt-2">
            <Label>Visibilidad de precios</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pricing-mode"
                value="SHOW_ALL"
                checked={pricingMode === "SHOW_ALL"}
                disabled={!isOwner || saving}
                onChange={() => {
                  setPricingMode("SHOW_ALL");
                  persist({ pricingMode: "SHOW_ALL" });
                }}
              />
              Mostrar precio en todos los productos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pricing-mode"
                value="REQUEST_ALL"
                checked={pricingMode === "REQUEST_ALL"}
                disabled={!isOwner || saving}
                onChange={() => {
                  setPricingMode("REQUEST_ALL");
                  persist({ pricingMode: "REQUEST_ALL" });
                }}
              />
              Precio a solicitud en todos los productos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pricing-mode"
                value="CUSTOM"
                checked={pricingMode === "CUSTOM"}
                disabled={!isOwner || saving}
                onChange={() => {
                  setPricingMode("CUSTOM");
                  persist({ pricingMode: "CUSTOM" });
                }}
              />
              Personalizado por producto
            </label>
          </div>
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
          <div className="grid grid-cols-2 gap-3">
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
              <Input
                id="store-country"
                value={country}
                disabled={!isOwner || saving}
                onChange={(e) => setCountry(e.target.value)}
                onBlur={() => persist()}
              />
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
            Enlaces a tus redes sociales. Se mostrarán en tu catálogo público.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            return (
              <div key={platform.key} className="space-y-2">
                <Label htmlFor={`social-${platform.key}`}>{platform.label}</Label>
                <div className="flex gap-2 items-center">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {platform.label.charAt(0).toUpperCase()}
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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Productos</span>
            <span>
              {usage.products} de {plan.max_products}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Imágenes por producto</span>
            <span>hasta {plan.max_images_per_product}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Almacenamiento</span>
              <span>
                {formatBytes(usage.bytesUsed)} de {formatBytes(plan.max_storage_bytes)}
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

