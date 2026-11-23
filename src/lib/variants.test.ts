import { describe, expect, it } from "vitest";
import { attributesFromPairs, pairsFromAttributes } from "@/lib/variants";

describe("typed variant measurements", () => {
  it("formats and restores a weight value with its unit", () => {
    const attributes = attributesFromPairs([
      { name: "Peso", value: "0,75", type: "peso", unit: "kg" },
    ]);

    expect(attributes).toEqual({ Peso: "0.75 kg" });
    expect(pairsFromAttributes(attributes)).toEqual([
      { name: "Peso", value: "0.75", type: "peso", unit: "kg" },
    ]);
  });

  it("formats and restores all three size dimensions", () => {
    const attributes = attributesFromPairs([
      {
        name: "Tamaño",
        value: "",
        type: "tamano",
        unit: "cm",
        dimensions: { height: "20", width: "10.5", depth: "3" },
      },
    ]);

    expect(attributes).toEqual({ Tamaño: "20 × 10.5 × 3 cm" });
    expect(pairsFromAttributes(attributes)).toEqual([
      {
        name: "Tamaño",
        value: "",
        type: "tamano",
        unit: "cm",
        dimensions: { height: "20", width: "10.5", depth: "3" },
      },
    ]);
  });

  it.each([
    {
      dimensions: { height: "20", width: "", depth: "" },
      expected: "Alto: 20 cm",
    },
    {
      dimensions: { height: "", width: "10.5", depth: "" },
      expected: "Ancho: 10.5 cm",
    },
    {
      dimensions: { height: "", width: "", depth: "3" },
      expected: "Profundidad: 3 cm",
    },
  ])("accepts and restores any one size dimension", ({ dimensions, expected }) => {
    const attributes = attributesFromPairs([
      { name: "Tamaño", value: "", type: "tamano", unit: "cm", dimensions },
    ]);

    expect(attributes).toEqual({ Tamaño: expected });
    expect(pairsFromAttributes(attributes)).toEqual([
      { name: "Tamaño", value: "", type: "tamano", unit: "cm", dimensions },
    ]);
  });

  it("preserves additional optional size dimensions", () => {
    const dimensions = { height: "20", width: "", depth: "3" };
    const attributes = attributesFromPairs([
      { name: "Tamaño", value: "", type: "tamano", unit: "cm", dimensions },
    ]);

    expect(attributes).toEqual({ Tamaño: "Alto: 20 × Profundidad: 3 cm" });
    expect(pairsFromAttributes(attributes)).toEqual([
      { name: "Tamaño", value: "", type: "tamano", unit: "cm", dimensions },
    ]);
  });

  it("requires at least one valid size dimension", () => {
    expect(() =>
      attributesFromPairs([
        {
          name: "Tamaño",
          value: "",
          type: "tamano",
          unit: "cm",
          dimensions: { height: "", width: "", depth: "" },
        },
      ]),
    ).toThrow("Indica al menos una medida: alto, ancho o profundidad.");

    expect(() =>
      attributesFromPairs([
        {
          name: "Tamaño",
          value: "",
          type: "tamano",
          unit: "cm",
          dimensions: { height: "", width: "0", depth: "" },
        },
      ]),
    ).toThrow("Indica un valor numérico mayor que cero para el ancho.");

    expect(() =>
      attributesFromPairs([
        { name: "Peso", value: "0", type: "peso", unit: "kg" },
      ]),
    ).toThrow("Indica un valor numérico mayor que cero para el peso.");
  });
});
