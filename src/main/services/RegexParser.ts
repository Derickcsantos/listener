import { bibleBooks } from "../../config/bibleBooks.js";
import type { BibleReference } from "../../types/domain.js";
import type { IBibleReferenceParser, IConfigurationService } from "../interfaces/services.js";
import { normalizeText, parsePortugueseNumber } from "../utils/text.js";

const numberPattern = "\\d+|(?:um|uma|primeiro|primeira|dois|duas|segundo|segunda|tres|terceiro|terceira|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezassete|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento)(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?";

export class RegexParser implements IBibleReferenceParser {
  constructor(private readonly configurationService: IConfigurationService) {}

  parse(text: string): BibleReference[] {
    const normalized = normalizeText(text);
    const references: BibleReference[] = [];

    const aliasEntries = bibleBooks.flatMap((book) =>
      book.aliases.map((alias) => ({
        canonical: book.canonical,
        alias: normalizeText(alias)
      }))
    );

    aliasEntries.sort((a, b) => b.alias.length - a.alias.length);

    for (const { canonical, alias } of aliasEntries) {
      const spokenExpression = new RegExp(
        `(?:^|\\s)${escapeRegExp(alias)}\\s+(?:capitulo\\s+)?(${numberPattern})\\s+(?:versiculo|verso)\\s+(${numberPattern})(?=$|\\s)`,
        "g"
      );

      for (const match of normalized.matchAll(spokenExpression)) {
        const chapter = parsePortugueseNumber(match[1]);
        const verse = parsePortugueseNumber(match[2]);
        if (!chapter || !verse) continue;

        references.push({
          book: canonical,
          chapter,
          verse,
          version: this.configurationService.get().bibleVersion || "NAA",
          rawText: match[0].trim(),
          confidence: 0.95
        });
      }

      const compactExpression = new RegExp(`(?:^|\\s)${escapeRegExp(alias)}\\s+(${numberPattern})\\s*:?\\s+(${numberPattern})(?=$|\\s)`, "g");

      for (const match of normalized.matchAll(compactExpression)) {
        const chapter = parsePortugueseNumber(match[1]);
        const verse = parsePortugueseNumber(match[2]);
        if (!chapter || !verse) continue;

        references.push({
          book: canonical,
          chapter,
          verse,
          version: this.configurationService.get().bibleVersion || "NAA",
          rawText: match[0].trim(),
          confidence: 0.95
        });
      }
    }

    return dedupe(references);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(references: BibleReference[]): BibleReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.book}-${reference.chapter}-${reference.verse}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
