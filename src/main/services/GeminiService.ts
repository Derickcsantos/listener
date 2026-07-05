import type { BibleReference } from "../../types/domain.js";
import type { IConfigurationService, IGeminiService, ILoggerService } from "../interfaces/services.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.5-flash"];

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
      const payload = await this.generateContent(apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      });
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
      await this.generateContent(apiKey, {
        contents: [{ parts: [{ text: "Responda somente OK." }] }],
        generationConfig: { temperature: 0 }
      });
      return true;
    } catch (error) {
      this.logger.warn("Gemini connection test failed.", error);
      return false;
    }
  }

  private async generateContent(apiKey: string, body: unknown): Promise<GeminiResponse> {
    const errors: string[] = [];

    for (const model of geminiModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          errors.push(`${model}: HTTP ${response.status} ${errorBody.slice(0, 180)}`);
          if (response.status === 400 || response.status === 401 || response.status === 403) {
            continue;
          }
          continue;
        }

        return (await response.json()) as GeminiResponse;
      } catch (error) {
        errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Nenhum modelo Gemini respondeu com sucesso. ${errors.join(" | ")}`);
  }
}
