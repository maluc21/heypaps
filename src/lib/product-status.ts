export type ProductStatus =
  | "hidden"
  | "paused"
  | "out-of-stock"
  | "made-to-order"
  | "in-stock";

export type ProductStatusInput = {
  active: boolean;
  paused: boolean;
  variants: { active: boolean; stock: number | null }[];
};

export const PRODUCT_STATUS_PRESENTATION: Record<
  ProductStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  hidden: {
    label: "Oculto",
    badgeClass: "border-[#efefeb] bg-[#efefeb] text-[#555]",
    dotClass: "bg-[#737373]",
  },
  paused: {
    label: "En pausa",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
    dotClass: "bg-amber-500",
  },
  "out-of-stock": {
    label: "Sin stock",
    badgeClass: "border-red-200 bg-red-50 text-red-900",
    dotClass: "bg-red-600",
  },
  "made-to-order": {
    label: "Por encargo",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-900",
    dotClass: "bg-sky-600",
  },
  "in-stock": {
    label: "Disponible",
    badgeClass: "border-[#34ef5a] bg-[#34ef5a]/20 text-[#181818]",
    dotClass: "bg-[#128b2b]",
  },
};

export function getProductStatus(product: ProductStatusInput): ProductStatus {
  if (!product.active) return "hidden";
  if (product.paused) return "paused";

  const activeVariants = product.variants.filter((variant) => variant.active);
  const hasAvailableStock = activeVariants.some(
    (variant) => variant.stock === null || variant.stock > 0,
  );
  if (!hasAvailableStock) return "out-of-stock";
  if (activeVariants.every((variant) => variant.stock === null)) {
    return "made-to-order";
  }
  return "in-stock";
}
