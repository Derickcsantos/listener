import type { BibleReference } from "../../types/domain.js";
import type { IConfigurationService, IGeminiService, ILoggerService } from "../interfaces/services.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class GeminiService implements IGeminiService {
  constructor(
    private readonly configurationService: IConfigurationService,
    private readonly logger: ILoggerService
  ) {}

  async interpret(text: string): Promise<BibleReference[]> {
    const apiKey = this.configurationService.get().geminiApiKey;
    if (!apiKey) return [];

    const prompt = [
      "Extraia referencias biblicas completas de uma frase em portugues.",
      "Retorne somente JSON valido no formato:",
      "{\"references\":[{\"book\":\"Joao\",\"chapter\":3,\"verse\":16,\"confidence\":0.9}]}",
      "Inclua somente referencias com livro, capitulo e versiculo. Se faltar qualquer parte, retorne {\"references\":[]}.",
      `Frase: ${text}`
    ].join("\n");

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini responded with ${response.status}`);
      }

      const payload = (await response.json()) as GeminiResponse;
      const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return [];

      const parsed = JSON.parse(raw) as { references?: Array<Partial<BibleReference>> };
      return (parsed.references ?? [])
        .filter((reference) => reference.book && reference.chapter && reference.verse)
        .map((reference) => ({
          book: String(reference.book),
          chapter: Number(reference.chapter),
          verse: Number(reference.verse),
          version: this.configurationService.get().bibleVersion || "NAA",
          rawText: text,
          confidence: Number(reference.confidence ?? 0.65)
        }))
        .filter((reference) => reference.confidence >= 0.75);
    } catch (error) {
      this.logger.warn("Gemini interpretation failed.", error);
      return [];
    }
  }

  async testConnection(apiKey = this.configurationService.get().geminiApiKey): Promise<boolean> {
    if (!apiKey) return false;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Responda somente OK." }] }],
            generationConfig: { temperature: 0 }
          })
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Gemini respondeu ${response.status}: ${body.slice(0, 200)}`);
      }

      return true;
    } catch (error) {
      this.logger.warn("Gemini connection test failed.", error);
      return false;
    }
  }
}
