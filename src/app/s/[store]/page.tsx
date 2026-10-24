import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { CatalogGrid } from "@/components/public/catalog-grid";
import { WhatsAppButton } from "@/components/public/whatsapp-button";
import { getCatalog } from "@/lib/catalog";
import { buildCatalogMessage } from "@/lib/whatsapp";
import { publicUrl } from "@/lib/public-url";
import { getEnv } from "@/lib/env";

/**
 * Productos por pagina.
 *
 * Doce es lo que entra en la pantalla de un movil sin desplazar: menos HTML,
 * menos nodos y menos imagenes en vuelo. Con mas productos, la paginacion
 * sigue abajo.
 */
const PAGE_SIZE = 12;

type PageProps = {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ c?: string; e?: string; pagina?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store } = await params;
  const data = await getCatalog(store, 1, 0, null);
  if (!data?.store) return { title: "Catálogo no disponible" };

  // Canonical por subdominio: si la tienda se sirve desde {tienda}.dominio.com
  // esa es la URL canonica; si no, la ruta /s/{slug} (plan §4.5).
  const host = (await headers()).get("host");
  const canonical = publicUrl({
    host,
    appUrl: getEnv().NEXT_PUBLIC_APP_URL,
    storeSlug: store,
  });

  return {
    title: data.store.name,
    description: `Catálogo de ${data.store.name}`,
    metadataBase: new URL(canonical),
    alternates: { canonical },
    openGraph: {
      title: data.store.name,
      description: `Catálogo de ${data.store.name}`,
      type: "website",
      url: canonical,
    },
  };
}

const SOCIAL_ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M15 8.5c0-2.5 2-4.5 4.5-3.5C17 7 15 9 15 8.5z" />
      <path d="M16.75 17.5c3.5-1 3-3.5 2.5-4.5" />
      <path d="M6.75 17.5c-3.5-1-3-3.5-2.5-4.5" />
      <path d="M12 12a3 3 0 0 0-2.83-2H9.5" />
      <path d="M12 12a3 3 0 0 1 2.83-2H14.5" />
      <path d="M16.75 6.5c-3.5 1-3 3.5-2.5 4.5" />
      <path d="M6.75 6.5c3.5 1 3 3.5 2.5 4.5" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
} as const;

const SOCIAL_URLS = {
  instagram: (handle: string) => `https://instagram.com/${handle.replace(/^@/, "")}`,
  facebook: (handle: string) => `https://facebook.com/${handle.replace(/^@/, "")}`,
  tiktok: (handle: string) => `https://tiktok.com/@${handle.replace(/^@/, "")}`,
  linkedin: (handle: string) => `https://linkedin.com/in/${handle.replace(/^@/, "")}`,
  youtube: (handle: string) => `https://youtube.com/@${handle.replace(/^@/, "")}`,
  x: (handle: string) => `https://x.com/${handle.replace(/^@/, "")}`,
} as const;

export default async function PublicCatalogPage({ params, searchParams }: PageProps) {
  // Render por petición: con Partial Prerender el shell se serviría con HTTP 200
  // y notFound() no cambiaría el status. Un catálogo indexable necesita 404 real.
  await connection();
  const { store: storeSlug } = await params;
  const { c, e, pagina } = await searchParams;

  const page = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const data = await getCatalog(storeSlug, PAGE_SIZE, offset, c ?? null, e ?? null);
  // Tienda inexistente, en borrador o suspendida: mismo 404 en todos los casos.
  if (!data?.store) notFound();

  const { store, categories, tags, products, pagination } = data;
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  const catalogUrl = `/s/${storeSlug}`;
  const whatsappMessage = buildCatalogMessage({
    storeName: store.name,
    catalogUrl,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        {store.logo ? (
          <Image
            src={store.logo}
            alt={store.name}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{store.name}</h1>
        {store.whatsapp ? (
          <WhatsAppButton
            phone={store.whatsapp}
            message={whatsappMessage}
            storeId={store.id}
            label="WhatsApp"
            className="shrink-0 rounded-full bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
          />
        ) : null}
        {(store.social_links && Object.keys(store.social_links).length > 0) ? (
          <nav aria-label="Redes sociales" className="flex items-center gap-2 shrink-0">
            {Object.entries(store.social_links).map(([platform, handle]) => {
              const Icon = SOCIAL_ICONS[platform as keyof typeof SOCIAL_ICONS];
              const buildUrl = SOCIAL_URLS[platform as keyof typeof SOCIAL_URLS];
              if (!Icon || !buildUrl || !handle) return null;
              return (
                <Link
                  key={platform}
                  href={buildUrl(handle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors p-1"
                  aria-label={platform}
                >
                  {Icon}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className="flex-1 space-y-4 pt-4">
        {categories.length > 0 || tags.length > 0 ? (
          <div className="space-y-2">
            {categories.length > 0 ? (
              <nav aria-label="Categorías" className="-mx-4 overflow-x-auto px-4">
                <ul className="flex w-max gap-2 pb-1">
                  <li>
                    <Link
                      href={`/s/${storeSlug}${e ? `?e=${e}` : ""}`}
                      className={`block rounded-full border px-3 py-1.5 text-sm ${
                        !c
                          ? "border-foreground bg-foreground text-background"
                          : "border-border"
                      }`}
                    >
                      Todos
                    </Link>
                  </li>
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/s/${storeSlug}?c=${category.slug}${e ? `&e=${e}` : ""}`}
                        className={`block rounded-full border px-3 py-1.5 text-sm ${
                          c === category.slug
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        }`}
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {tags.length > 0 ? (
              <nav aria-label="Etiquetas" className="-mx-4 overflow-x-auto px-4">
                <ul className="flex w-max gap-2 pb-1">
                  {tags.map((tag) => (
                    <li key={tag.id}>
                      <Link
                        href={`/s/${storeSlug}?e=${tag.slug}${c ? `&c=${c}` : ""}`}
                        className={`block rounded-full border px-3 py-1.5 text-sm ${
                          e === tag.slug
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        }`}
                        style={
                          tag.color && e !== tag.slug
                            ? { color: tag.color, borderColor: tag.color }
                            : undefined
                        }
                      >
                        {tag.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        ) : null}

        <CatalogGrid
          storeSlug={storeSlug}
          products={products}
          currency={store.currency}
        />

        {totalPages > 1 ? (
          <nav aria-label="Paginación" className="flex items-center justify-center gap-3 pt-2">
            {page > 1 ? (
              <Link
                href={`/s/${storeSlug}?pagina=${page - 1}${c ? `&c=${c}` : ""}${e ? `&e=${e}` : ""}`}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                Anterior
              </Link>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {page} de {totalPages}
            </span>
            {pagination.has_more ? (
              <Link
                href={`/s/${storeSlug}?pagina=${page + 1}${c ? `&c=${c}` : ""}${e ? `&e=${e}` : ""}`}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                Siguiente
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>

      {store.plan_code !== "pro" ? (
        <footer className="pt-8 text-center text-xs text-muted-foreground">
          Hecho con Catalogo
        </footer>
      ) : null}
    </div>
  );
}
