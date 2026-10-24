import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import type { PublicProductCard } from "@/lib/catalog";

/** Chips de estatus que el comprador puede ver en la card (plan §4.4). */
const STATUS_STYLES: Record<string, string> = {
  Pausado: "bg-amber-100 text-amber-900",
  Agotado: "bg-red-100 text-red-900",
  "Por encargo": "bg-sky-100 text-sky-900",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status];
  if (!style) return null;
  return (
    <span
      className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

/** Placeholder cuando el producto no tiene foto: iniciales sobre color suave. */
function ProductPlaceholder({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
      {initials || "?"}
    </div>
  );
}

type Props = {
  storeSlug: string;
  product: PublicProductCard;
  currency: string;
  pricingMode?: string;
  /** La primera imagen de la pagina es el LCP: se carga con prioridad. */
  priority?: boolean;
};

export function ProductCard({ storeSlug, product, currency, pricingMode = "SHOW_ALL", priority = false }: Props) {
  const href = `/s/${storeSlug}/${product.slug}`;
  const image = product.images[0];
  const canShowPrice =
    pricingMode === "SHOW_ALL" ||
    (pricingMode === "CUSTOM" && product.show_price === true);

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            priority={priority}
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <ProductPlaceholder name={product.name} />
        )}
        <StatusBadge status={product.status} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.tag ? (
          <span
            className="w-fit rounded-full px-2 py-0.5 text-xs font-medium"
            style={
              product.tag_color
                ? { color: product.tag_color, backgroundColor: `${product.tag_color}1a` }
                : undefined
            }
          >
            {product.tag}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
        {canShowPrice && product.price_from !== null ? (
          <p className="mt-auto pt-1 text-base font-semibold">
            {product.price_is_range ? "desde " : ""}
            {formatMoney(product.price_from, currency)}
          </p>
        ) : !canShowPrice ? (
          <p className="mt-auto pt-1 text-sm font-medium text-muted-foreground">
            Precio a solicitud
          </p>
        ) : (
          <p className="mt-auto pt-1 text-sm text-muted-foreground">Consultar precio</p>
        )}
      </div>
    </Link>
  );
}
