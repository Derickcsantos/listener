import { randomUUID } from "node:crypto";
import type { TranscriptLine } from "../../types/domain.js";
import type { ITranscriptService } from "../interfaces/services.js";

export class TranscriptService implements ITranscriptService {
  private readonly lines: TranscriptLine[] = [];

  add(text: string, isFinal: boolean): TranscriptLine {
    const trimmed = text.trim();
    const line: TranscriptLine = {
      id: randomUUID(),
      text: trimmed,
      createdAt: new Date().toISOString(),
      isFinal
    };
    if (trimmed) {
      this.lines.push(line);
    }
    return line;
  }

  all(): TranscriptLine[] {
    return [...this.lines];
  }

  clear(): void {
    this.lines.length = 0;
  }
}
