/**
 * Cálculo de precio con descuento (espejo de public.variants.final_price_cents).
 *
 * SQL:
 *   greatest(0, case discount_type
 *     when 'percent' then price_cents - ((price_cents * discount_value + 50) / 100)
 *     when 'fixed'   then price_cents - discount_value
 *     else price_cents end)
 *
 * División entera de Postgres (hacia abajo para positivos) + 50 = redondeo half-up.
 */

function finalPriceCents({
  price_cents,
  discount_type = "none",
  discount_value = 0,
}: {
  price_cents: number;
  discount_type?: "none" | "percent" | "fixed";
  discount_value?: number;
}): number {
  let result: number;
  if (discount_type === "percent") {
    result = price_cents - Math.floor((price_cents * discount_value + 50) / 100);
  } else if (discount_type === "fixed") {
    result = price_cents - discount_value;
  } else {
    result = price_cents;
  }
  return Math.max(0, result);
}

describe("precio con descuento", () => {
  it("sin descuento devuelve el precio", () => {
    expect(finalPriceCents({ price_cents: 1000 })).toBe(1000);
  });

  it("descuento percent aplica redondeo half-up", () => {
    // 1000 * 10 + 50 = 10050 / 100 = 100 (entero) -> 1000 - 100 = 900
    expect(finalPriceCents({ price_cents: 1000, discount_type: "percent", discount_value: 10 })).toBe(900);
    // 999 * 33 + 50 = 32967+50=33017 / 100 = 330 -> 999 - 330 = 669
    expect(finalPriceCents({ price_cents: 999, discount_type: "percent", discount_value: 33 })).toBe(669);
    // 100 * 50 + 50 = 5050 / 100 = 50 -> 100 - 50 = 50 (exactamente la mitad, half-up)
    expect(finalPriceCents({ price_cents: 100, discount_type: "percent", discount_value: 50 })).toBe(50);
  });

  it("descuento fixed resta el valor", () => {
    expect(finalPriceCents({ price_cents: 1000, discount_type: "fixed", discount_value: 250 })).toBe(750);
  });

  it("clamp a 0 cuando el descuento supera el precio", () => {
    expect(finalPriceCents({ price_cents: 100, discount_type: "fixed", discount_value: 500 })).toBe(0);
    expect(finalPriceCents({ price_cents: 100, discount_type: "percent", discount_value: 100 })).toBe(0);
  });

  it("precio nunca negativo", () => {
    expect(finalPriceCents({ price_cents: 10, discount_type: "fixed", discount_value: 1000 })).toBe(0);
  });
});
