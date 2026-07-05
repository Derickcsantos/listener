import { app } from "electron";
import { AudioService } from "./services/AudioService.js";
import { BibleCommandDetector } from "./services/BibleCommandDetector.js";
import { ConfigurationService } from "./services/ConfigurationService.js";
import { ExportService } from "./services/ExportService.js";
import { GeminiService } from "./services/GeminiService.js";
import { GladiaService } from "./services/GladiaService.js";
import { HolyricsAutomationService } from "./services/HolyricsAutomationService.js";
import { LoggerService } from "./services/LoggerService.js";
import { RegexParser } from "./services/RegexParser.js";
import { TranscriptService } from "./services/TranscriptService.js";
import { WindowService } from "./services/WindowService.js";

let windowService: WindowService | undefined;

app.whenReady().then(() => {
  const logger = new LoggerService();
  const configuration = new ConfigurationService(logger);
  const audio = new AudioService();
  const transcript = new TranscriptService();
  const regexParser = new RegexParser(configuration);
  const gemini = new GeminiService(configuration, logger);
  const detector = new BibleCommandDetector(regexParser, gemini);
  const gladia = new GladiaService(configuration, logger);
  const holyrics = new HolyricsAutomationService(configuration, logger);
  const exportService = new ExportService();

  windowService = new WindowService(configuration, audio, gladia, transcript, detector, gemini, holyrics, exportService, logger);
  windowService.registerIpc();
  windowService.createMainWindow();

  app.on("activate", () => {
    if (windowService) {
      windowService.createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
