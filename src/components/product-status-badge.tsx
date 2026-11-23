import { Badge } from "@/components/ui/badge";
import {
  getProductStatus,
  PRODUCT_STATUS_PRESENTATION,
  type ProductStatusInput,
} from "@/lib/product-status";

export function ProductStatusBadge({ product }: { product: ProductStatusInput }) {
  const presentation = PRODUCT_STATUS_PRESENTATION[getProductStatus(product)];

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 ${presentation.badgeClass}`}
    >
      <span
        className={`size-2 shrink-0 rounded-full ${presentation.dotClass}`}
        aria-hidden="true"
      />
      {presentation.label}
    </Badge>
  );
}
