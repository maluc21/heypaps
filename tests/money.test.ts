/**
 * Conversión de montos en lempiras a centavos (src/lib/money.ts).
 */

import { parseAmountToCents } from "@/lib/money";

describe("parseAmountToCents", () => {
  it("interpreta enteros como lempiras completas", () => {
    expect(parseAmountToCents("450")).toBe(45000);
    expect(parseAmountToCents("1")).toBe(100);
  });

  it("interpreta decimales desde el punto", () => {
    expect(parseAmountToCents("450.5")).toBe(45050);
    expect(parseAmountToCents("450.50")).toBe(45050);
    expect(parseAmountToCents("0.01")).toBe(1);
  });

  it("ignora espacios alrededor", () => {
    expect(parseAmountToCents("  450.00 ")).toBe(45000);
  });

  it("rechaza formatos ambiguos o inválidos", () => {
    expect(parseAmountToCents("1,000")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("1e3")).toBeNull();
    expect(parseAmountToCents("450.555")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("acepta el máximo de 7 dígitos enteros y rechaza 8", () => {
    expect(parseAmountToCents("9999999.99")).toBe(999999999);
    expect(parseAmountToCents("21474836.47")).toBeNull();
    expect(parseAmountToCents("99999999")).toBeNull();
  });
});
