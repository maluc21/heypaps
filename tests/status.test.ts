/**
 * Derivación de estatus (espejo de public.derive_status).
 *
 * Precedencia sobre variantes activas:
 *   Oculto   -> producto no activo o borrado
 *   Pausado  -> producto.paused
 *   Agotado  -> ninguna variante activa con stock > 0 o stock IS NULL
 *   Por encargo -> todas las variantes activas tienen stock IS NULL
 *   Disponible -> >=1 variante activa con stock > 0 o stock IS NULL
 */

interface Variant {
  active: boolean;
  stock: number | null;
}

interface Product {
  active: boolean;
  deleted_at: Date | null;
  paused: boolean;
  variants: Variant[];
}

function deriveStatus(p: Product): string {
  if (!p.active || p.deleted_at !== null) return "Oculto";
  if (p.paused) return "Pausado";
  const active = p.variants.filter((v) => v.active);
  const anyAvailable = active.some((v) => v.stock === null || v.stock > 0);
  if (!anyAvailable) return "Agotado";
  const allOnOrder = active.every((v) => v.stock === null);
  if (allOnOrder && active.length > 0) return "Por encargo";
  return "Disponible";
}

describe("derivación de estatus", () => {
  it("producto inactivo -> Oculto", () => {
    expect(deriveStatus({ active: false, deleted_at: null, paused: false, variants: [] })).toBe("Oculto");
  });

  it("producto borrado -> Oculto", () => {
    expect(deriveStatus({ active: true, deleted_at: new Date(), paused: false, variants: [] })).toBe("Oculto");
  });

  it("producto pausado -> Pausado", () => {
    expect(deriveStatus({ active: true, deleted_at: null, paused: true, variants: [] })).toBe("Pausado");
  });

  it("sin stock y sin variantes -> Agotado", () => {
    expect(deriveStatus({ active: true, deleted_at: null, paused: false, variants: [] })).toBe("Agotado");
  });

  it("todas variantes stock 0 -> Agotado", () => {
    expect(
      deriveStatus({
        active: true,
        deleted_at: null,
        paused: false,
        variants: [{ active: true, stock: 0 }, { active: true, stock: 0 }],
      })
    ).toBe("Agotado");
  });

  it("una variante con stock > 0 -> Disponible", () => {
    expect(
      deriveStatus({
        active: true,
        deleted_at: null,
        paused: false,
        variants: [{ active: true, stock: 5 }, { active: true, stock: 0 }],
      })
    ).toBe("Disponible");
  });

  it("todas variantes stock null -> Por encargo", () => {
    expect(
      deriveStatus({
        active: true,
        deleted_at: null,
        paused: false,
        variants: [{ active: true, stock: null }, { active: true, stock: null }],
      })
    ).toBe("Por encargo");
  });

  it("variante inactiva no cuenta", () => {
    expect(
      deriveStatus({
        active: true,
        deleted_at: null,
        paused: false,
        variants: [{ active: false, stock: 5 }, { active: true, stock: 0 }],
      })
    ).toBe("Agotado");
  });
});
