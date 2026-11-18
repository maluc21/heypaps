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

  it("rejects incomplete or non-positive measurements", () => {
    expect(() =>
      attributesFromPairs([
        {
          name: "Tamaño",
          value: "",
          type: "tamano",
          unit: "cm",
          dimensions: { height: "20", width: "", depth: "3" },
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
