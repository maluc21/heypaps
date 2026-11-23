import { Badge } from "@/components/ui/badge";
import {
  getProductStatus,
  PRODUCT_STATUS_OPTIONS,
  type ProductStatusInput,
} from "@/lib/product-status";

export function ProductStatusBadge({ product }: { product: ProductStatusInput }) {
  const status = getProductStatus(product);
  const presentation = PRODUCT_STATUS_OPTIONS.find((option) => option.value === status);

  if (!presentation) {
    throw new Error(`No existe presentación para el estado de producto "${status}".`);
  }

  return (
    <Badge variant="outline" className={`gap-1.5 ${presentation.badgeClassName}`}>
      <span
        className={`size-2 shrink-0 rounded-full ${presentation.dotClassName}`}
        aria-hidden="true"
      />
      {presentation.label}
    </Badge>
  );
}
