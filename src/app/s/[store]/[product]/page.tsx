import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { ProductDetail } from "@/components/public/product-detail";
import { CopyLinkButton } from "@/components/public/copy-link-button";
import { getCatalog, getPublicProduct } from "@/lib/catalog";
import { publicUrl } from "@/lib/public-url";
import { getEnv } from "@/lib/env";

type PageProps = {
  params: Promise<{ store: string; product: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { store: storeSlug, product: productSlug } = await params;
  const data = await getPublicProduct(storeSlug, productSlug);
  if (!data?.product) return { title: "Producto no disponible" };

  // Canonical por subdominio (plan §4.5).
  const host = (await headers()).get("host");
  const canonical = publicUrl({
    host,
    appUrl: getEnv().NEXT_PUBLIC_APP_URL,
    storeSlug,
    path: `/${productSlug}`,
  });

  return {
    title: data.product.name,
    description: data.product.description ?? `Producto de ${data.store?.name ?? ""}`,
    metadataBase: new URL(canonical),
    alternates: { canonical },
    openGraph: {
      title: data.product.name,
      description: data.product.description ?? undefined,
      type: "website",
      url: canonical,
    },
  };
}

export default async function PublicProductPage({ params }: PageProps) {
  // Render por petición: notFound() debe devolver HTTP 404 real, no un shell 200.
  await connection();
  const { store: storeSlug, product: productSlug } = await params;

  const [data, catalog] = await Promise.all([
    getPublicProduct(storeSlug, productSlug),
    getCatalog(storeSlug, 1, 0, null),
  ]);

  if (!data?.product || !data.store || !catalog?.store) notFound();

  const productUrl = `/s/${storeSlug}/${productSlug}`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          href={`/s/${storeSlug}`}
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm"
        >
          ← Catálogo
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {data.store.name}
        </span>
      </header>

      <main className="flex-1 pt-4">
        <ProductDetail
          store={data.store}
          storeId={catalog.store.id}
          product={data.product}
          productUrl={productUrl}
        />
      </main>

      <footer className="pt-6">
        <CopyLinkButton />
      </footer>
    </div>
  );
}
