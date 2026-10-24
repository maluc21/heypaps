"use client";

/**
 * Ajustes de la tienda (plan §2.6, §2.7 y §2.8).
 *
 * Solo el owner puede cambiar los ajustes; un editor ve el formulario en modo
 * lectura. El logo se sube al DAM con el mismo flujo que las imágenes de los
 * productos.
 */

import { useState, useSyncExternalStore } from "react";
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
  const [currency, setCurrency] = useState(store.currency);
  const [secondaryCurrency, setSecondaryCurrency] = useState(store.secondary_currency ?? "");
  const [fxRate, setFxRate] = useState(store.fx_rate ? String(store.fx_rate) : "");
  const [logo, setLogo] = useState(store.logo_file_id);
  const [slug, setSlug] = useState(store.slug);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const save = async () => {
    setSaving(true);
    const socialLinksObj = SOCIAL_PLATFORMS.reduce((acc, p) => {
      const val = socialLinks[p.key]?.trim();
      if (val) acc[p.key] = val;
      return acc;
    }, {} as Record<string, string>);

    const res = await updateStoreSettings(store.id, {
      name,
      description,
      whatsapp,
      currency,
      secondaryCurrency: secondaryCurrency || null,
      fxRate: secondaryCurrency ? Number(fxRate) : null,
      socialLinks: Object.keys(socialLinksObj).length > 0 ? socialLinksObj : undefined,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Ajustes guardados.");
    router.refresh();
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
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-description">Descripción</Label>
            <Textarea
              id="store-description"
              value={description}
              disabled={!isOwner}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-whatsapp">WhatsApp</Label>
            <Input
              id="store-whatsapp"
              value={whatsapp}
              disabled={!isOwner}
              placeholder="+504 1234 5678"
              onChange={(e) => setWhatsapp(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se guarda en formato internacional. Es a donde caen las ventas.
            </p>
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
          <CardTitle>Precios</CardTitle>
          <CardDescription>Moneda de tu catálogo y conversión opcional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-currency">Moneda principal</Label>
            <select
              id="store-currency"
              value={currency}
              disabled={!isOwner}
              onChange={(e) => setCurrency(e.target.value)}
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
              disabled={!isOwner}
              onChange={(e) => setSecondaryCurrency(e.target.value)}
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
                disabled={!isOwner}
                inputMode="decimal"
                placeholder="25.50"
                onChange={(e) => setFxRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tipo de cambio que usas para mostrar precios en la segunda moneda.
              </p>
            </div>
          ) : null}
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
          <CardTitle>Cuentas</CardTitle>
          <CardDescription>
            Enlaces a tus redes sociales. Se mostrarán en tu catálogo público.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform.key} className="space-y-2">
              <Label htmlFor={`social-${platform.key}`}>{platform.label}</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 text-muted-foreground">https://</span>
                <Input
                  id={`social-${platform.key}`}
                  value={socialLinks[platform.key]}
                  disabled={!isOwner}
                  placeholder={`${platform.label.toLowerCase()}.com/${platform.placeholder}`}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, [platform.key]: e.target.value }))}
                  className="flex-1"
                />
              </div>
            </div>
          ))}
        </CardContent>
        {isOwner ? (
          <div className="px-6 pb-6">
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        ) : null}
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
