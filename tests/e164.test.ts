/**
 * Parseo y formateo de WhatsApp E.164 (§8.1: WhatsApp verificado con deep link).
 */

function parseE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // Honduras: números móviles de 8 dígitos, con prefijo +501 (país) -> 11 dígitos totales con +
  if (digits.startsWith("501") && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.length === 8 && /^[39]/.test(digits)) {
    return `+501${digits}`;
  }
  if (digits.startsWith("+")) {
    return digits;
  }
  return null;
}

describe("E.164", () => {
  it("número local hondureño de 8 dígitos -> +501", () => {
    expect(parseE164("31234567")).toBe("+50131234567");
    expect(parseE164("91234567")).toBe("+50191234567");
  });

  it("ya con prefijo 501 de 11 dígitos -> +501...", () => {
    expect(parseE164("50131234567")).toBe("+50131234567");
  });

  it("con + ya incluido -> igual", () => {
    expect(parseE164("+50131234567")).toBe("+50131234567");
  });

  it("número inválido -> null", () => {
    expect(parseE164("123")).toBe(null);
    expect(parseE164("abc")).toBe(null);
  });
});
