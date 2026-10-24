"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updateProduct } from "@/lib/actions/product";
import { Edit } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  slug: string;
  price_cents: number | null;
  active: boolean;
  category_id: string | null;
  image_url: string | null;
  version?: number;
};

export function ProductListMobile({ products }: { products: Product[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle(product: Product) {
    setLoading(product.id);
    try {
      await updateProduct(product.id, product.version ?? 1, { active: !product.active });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          No hay productos aún.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {products.map((product) => (
        <Card key={product.id}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{product.name}</div>
              <div className="text-sm text-muted-foreground">
                ${((product.price_cents ?? 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={product.active ? "outline" : "default"}
                disabled={loading === product.id}
                onClick={() => handleToggle(product)}
                className="min-h-[44px]"
              >
                {product.active ? "Desactivar" : "Activar"}
              </Button>
              <Button size="sm" variant="ghost" className="min-h-[44px] px-3" render={<Link href={`/products/${product.slug}`} />}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
