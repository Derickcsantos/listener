import { dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TranscriptLine } from "../../types/domain.js";
import type { IExportService } from "../interfaces/services.js";

export class ExportService implements IExportService {
  async exportTranscript(lines: TranscriptLine[]): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({
      title: "Escolha onde salvar a transcricao",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths[0]) {
      return undefined;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(result.filePaths[0], `bible-listener-transcricao-${timestamp}.txt`);
    const content = lines.map((line) => `[${line.createdAt}] ${line.text}`).join("\n");
    await writeFile(filePath, content, "utf8");
    return filePath;
  }
}
