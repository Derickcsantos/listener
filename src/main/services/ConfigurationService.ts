import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AppConfiguration } from "../../types/domain.js";
import type { IConfigurationService, ILoggerService } from "../interfaces/services.js";

const defaultConfiguration: AppConfiguration = {
  gladiaApiKey: process.env.GLADIA_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  bibleVersion: "NAA"
};

export class ConfigurationService implements IConfigurationService {
  private readonly filePath: string;
  private configuration: AppConfiguration;

  constructor(private readonly logger: ILoggerService) {
    this.filePath = join(app.getPath("userData"), "config.json");
    this.configuration = this.load();
  }

  get(): AppConfiguration {
    return { ...this.configuration };
  }

  update(configuration: Partial<AppConfiguration>): AppConfiguration {
    this.configuration = {
      ...this.configuration,
      ...configuration,
      bibleVersion: configuration.bibleVersion || this.configuration.bibleVersion || "NAA"
    };
    this.persist();
    return this.get();
  }

  private load(): AppConfiguration {
    try {
      const stored = JSON.parse(readFileSync(this.filePath, "utf8")) as AppConfiguration;
      return { ...defaultConfiguration, ...stored };
    } catch {
      return { ...defaultConfiguration };
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.configuration, null, 2), "utf8");
    } catch (error) {
      this.logger.error("Unable to persist configuration.", error);
      throw error;
    }
  }
}
