const accentMap: Record<string, string> = {
  á: "a",
  à: "a",
  â: "a",
  ã: "a",
  é: "e",
  ê: "e",
  í: "i",
  ó: "o",
  ô: "o",
  õ: "o",
  ú: "u",
  ç: "c"
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[áàâãéêíóôõúç]/g, (char) => accentMap[char] ?? char)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const numberWords: Record<string, number> = {
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  duas: 2,
  segundo: 2,
  segunda: 2,
  tres: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100
};

export function parsePortugueseNumber(value: string): number | undefined {
  const normalized = normalizeText(value);
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const parts = normalized.split(/\s+e\s+|\s+/).filter((part) => part !== "e");
  let total = 0;
  for (const part of parts) {
    const number = numberWords[part];
    if (!number) return undefined;
    total += number;
  }
  return total || undefined;
}

export function formatReference(reference: { book: string; chapter: number; verse: number; version: string }): string {
  return `${reference.book} ${reference.chapter}:${reference.verse} ${reference.version}`;
}
