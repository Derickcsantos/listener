import type { DetectionResult } from "../../types/domain.js";
import type { IBibleCommandDetector, IBibleReferenceParser, IGeminiService } from "../interfaces/services.js";

export class BibleCommandDetector implements IBibleCommandDetector {
  constructor(
    private readonly regexParser: IBibleReferenceParser,
    private readonly geminiService: IGeminiService
  ) {}

  async detect(text: string): Promise<DetectionResult> {
    const localReferences = this.regexParser.parse(text);
    if (localReferences.length > 0) {
      return {
        references: localReferences,
        needsUserChoice: localReferences.length > 1,
        source: "regex"
      };
    }

    if (!looksLikePossibleBibleReference(text)) {
      return { references: [], needsUserChoice: false, source: "none" };
    }

    const geminiReferences = await this.geminiService.interpret(text);
    return {
      references: geminiReferences,
      needsUserChoice: geminiReferences.length > 1,
      source: geminiReferences.length > 0 ? "gemini" : "none"
    };
  }
}

function looksLikePossibleBibleReference(text: string): boolean {
  const value = text.toLowerCase();
  return /(cap[ií]tulo|vers[oií]culo|verso|primeir[ao]|segund[ao]|\bjo[aã]o\b|\bromanos\b|\bsalmos?\b|\bmateus\b|\bcor[ií]ntios\b|\btim[oó]teo\b)/i.test(value);
}
