import { describe, expect, it } from "vitest";
import {
  attributesFromPairs,
  discountValueToStorage,
  hidesSinglePresentation,
  pairsFromAttributes,
  stockToStorage,
  variantLabel,
} from "@/lib/variants";

describe("attributesFromPairs", () => {
  it("convierte pares en objeto y descarta filas vacías", () => {
    expect(
      attributesFromPairs([
        { name: "Talle", value: "M" },
        { name: "", value: "" },
        { name: "Color", value: "Negro" },
      ]),
    ).toEqual({ Talle: "M", Color: "Negro" });
  });

  it("sin pares devuelve un objeto vacío (producto de presentación única)", () => {
    expect(attributesFromPairs([{ name: "", value: "" }])).toEqual({});
  });

  it("rechaza un par con solo nombre o solo valor", () => {
    expect(() => attributesFromPairs([{ name: "Talle", value: "" }])).toThrow(/nombre y valor/);
    expect(() => attributesFromPairs([{ name: "", value: "M" }])).toThrow(/nombre y valor/);
  });

  it("rechaza un nombre repetido en vez de sobrescribirlo en silencio", () => {
    expect(() =>
      attributesFromPairs([
        { name: "Talle", value: "M" },
        { name: "Talle", value: "L" },
      ]),
    ).toThrow(/aparece dos veces/);
  });

  it("limita a 3 atributos", () => {
    const four = ["A", "B", "C", "D"].map((name) => ({ name, value: "x" }));
    expect(() => attributesFromPairs(four)).toThrow(/hasta 3/);
  });

  it("limita la longitud de cada nombre y valor", () => {
    expect(() =>
      attributesFromPairs([{ name: "x".repeat(41), value: "M" }]),
    ).toThrow(/40 caracteres/);
  });

  it("recorta espacios alrededor de nombres y valores", () => {
    expect(attributesFromPairs([{ name: "  Talle ", value: " M " }])).toEqual({ Talle: "M" });
  });
});

describe("pairsFromAttributes", () => {
  it("es la inversa de attributesFromPairs para editar una variante", () => {
    const original = { Talle: "M", Color: "Negro" };
    expect(attributesFromPairs(pairsFromAttributes(original))).toEqual(original);
  });
});

describe("discountValueToStorage", () => {
  it("sin descuento guarda cero aunque el campo tenga texto", () => {
    expect(discountValueToStorage("none", "20", 45050)).toBe(0);
  });

  it("porcentaje: entero de 0 a 100", () => {
    expect(discountValueToStorage("percent", "10", 45050)).toBe(10);
    expect(discountValueToStorage("percent", "0", 45050)).toBe(0);
    expect(() => discountValueToStorage("percent", "101", 45050)).toThrow(/0 a 100/);
    expect(() => discountValueToStorage("percent", "10.5", 45050)).toThrow(/entero/);
  });

  it("monto fijo: se convierte de lempiras a centavos", () => {
    expect(discountValueToStorage("fixed", "50.00", 45050)).toBe(5000);
    expect(discountValueToStorage("fixed", "50", 45050)).toBe(5000);
  });

  it("monto fijo debe ser menor que el precio", () => {
    expect(() => discountValueToStorage("fixed", "450.50", 45050)).toThrow(/menor que el precio/);
    expect(() => discountValueToStorage("fixed", "500", 45050)).toThrow(/menor que el precio/);
  });

  it("monto fijo inválido se rechaza", () => {
    expect(() => discountValueToStorage("fixed", "abc", 45050)).toThrow(/no es válido/);
  });
});

describe("stockToStorage", () => {
  it("por encargo guarda null, sin importar el campo", () => {
    expect(stockToStorage("", true)).toBeNull();
    expect(stockToStorage("5", true)).toBeNull();
  });

  it("stock entero mayor o igual a cero", () => {
    expect(stockToStorage("0", false)).toBe(0);
    expect(stockToStorage("12", false)).toBe(12);
  });

  it("sin stock ni 'por encargo' pide indicar una de las dos", () => {
    expect(() => stockToStorage("", false)).toThrow(/Indica el stock/);
    expect(() => stockToStorage("   ", false)).toThrow(/Indica el stock/);
  });

  it("rechaza negativo, decimal o texto", () => {
    expect(() => stockToStorage("-1", false)).toThrow(/entero/);
    expect(() => stockToStorage("1.5", false)).toThrow(/entero/);
    expect(() => stockToStorage("abc", false)).toThrow(/entero/);
  });
});

describe("hidesSinglePresentation", () => {
  const single = { id: "base", attributes: {}, active: true };
  const talleM = { id: "m", attributes: { Talle: "M" }, active: true };

  it("una talla activa oculta la presentación única activa", () => {
    expect(hidesSinglePresentation({ Talle: "M" }, true, [single], null)).toBe(true);
  });

  it("no oculta nada si la presentación única ya está oculta", () => {
    const hidden = { ...single, active: false };
    expect(hidesSinglePresentation({ Talle: "M" }, true, [hidden], null)).toBe(false);
  });

  it("una variante sin atributos no oculta nada", () => {
    expect(hidesSinglePresentation({}, true, [single], null)).toBe(false);
  });

  it("guardarla inactiva no oculta nada", () => {
    expect(hidesSinglePresentation({ Talle: "M" }, false, [single], null)).toBe(false);
  });

  it("editar la propia presentación única no cuenta como oculta a sí misma", () => {
    expect(hidesSinglePresentation({ Talle: "M" }, true, [single], "base")).toBe(false);
  });

  it("sin presentación única activa no oculta nada", () => {
    expect(hidesSinglePresentation({ Talle: "L" }, true, [talleM], null)).toBe(false);
  });
});

describe("variantLabel", () => {
  it("une los atributos y usa 'Única' sin atributos", () => {
    expect(variantLabel({ Talle: "M", Color: "Negro" })).toBe("Talle M / Color Negro");
    expect(variantLabel({})).toBe("Única");
  });
});
