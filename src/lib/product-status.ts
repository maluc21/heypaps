export type ProductStatus = "available" | "unavailable" | "hidden";

export type ProductStatusInput = {
  active: boolean;
  paused: boolean;
};

export const PRODUCT_STATUS_OPTIONS = [
  {
    value: "available",
    label: "Disponible",
    dotClassName: "bg-green-600",
    badgeClassName: "border-green-200 bg-green-50 text-green-900",
  },
  {
    value: "unavailable",
    label: "No disponible",
    dotClassName: "bg-red-500",
    badgeClassName: "border-red-200 bg-red-50 text-red-900",
  },
  {
    value: "hidden",
    label: "Oculto",
    dotClassName: "bg-gray-400",
    badgeClassName: "border-gray-200 bg-gray-100 text-gray-700",
  },
] as const;

export function getProductStatus(product: ProductStatusInput): ProductStatus {
  if (!product.active) return "hidden";
  if (product.paused) return "unavailable";
  return "available";
}
