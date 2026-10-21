import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CatalogGrid } from "@/components/public/catalog-grid";
import { WhatsAppButton } from "@/components/public/whatsapp-button";
import { getCatalog } from "@/lib/catalog";
import { buildCatalogMessage } from "@/lib/whatsapp";

const PAGE_SIZE = 24;

type PageProps = {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ c?: string; e?: string; pagina?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store } = await params;
  const data = await getCatalog(store, 1, 0, null);
  if (!data?.store) return { title: "Catálogo no disponible" };
  return {
    title: data.store.name,
    description: `Catálogo de ${data.store.name}`,
    openGraph: {
      title: data.store.name,
      description: `Catálogo de ${data.store.name}`,
      type: "website",
    },
  };
}

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
