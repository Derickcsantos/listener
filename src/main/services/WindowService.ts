import * as electron from "electron";
import { join } from "node:path";
import type { AppConfiguration, AppStatus, AudioInputDevice, BibleReference } from "../../types/domain.js";
import type {
  IAudioService,
  IBibleCommandDetector,
  IConfigurationService,
  IExportService,
  IGeminiService,
  IGladiaService,
  IHolyricsAutomationService,
  ILoggerService,
  ITranscriptService,
  HolyricsConnectionStatus
} from "../interfaces/services.js";

export class WindowService {
  private mainWindow?: electron.BrowserWindow;
  private status: AppStatus = "stopped";
  private lastOpenedReference?: BibleReference;
  private readonly openedReferences = new Map<string, number>();

  constructor(
    private readonly configurationService: IConfigurationService,
    private readonly audioService: IAudioService,
    private readonly gladiaService: IGladiaService,
    private readonly transcriptService: ITranscriptService,
    private readonly detector: IBibleCommandDetector,
    private readonly geminiService: IGeminiService,
    private readonly holyricsAutomationService: IHolyricsAutomationService,
    private readonly exportService: IExportService,
    private readonly logger: ILoggerService
  ) {}

  createMainWindow(): void {
    this.mainWindow = new electron.BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 640,
      title: "Bible Listener",
      webPreferences: {
        preload: join(electron.app.getAppPath(), "dist/preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      void this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      void this.mainWindow.loadFile(join(electron.app.getAppPath(), "dist/renderer/index.html"));
    }
  }

  registerIpc(): void {
    this.gladiaService.on("transcript", (...args: unknown[]) => {
      void this.handleTranscript(String(args[0] ?? ""), Boolean(args[1]));
    });
    this.gladiaService.on("error", (...args: unknown[]) => this.emitError(String(args[0] ?? "Erro no Gladia.")));

    electron.ipcMain.handle("app:getSnapshot", () => ({
      status: this.status,
      configuration: this.configurationService.get(),
      transcriptLines: this.transcriptService.all(),
      lastOpenedReference: this.lastOpenedReference
    }));

    electron.ipcMain.handle("config:save", (_event, configuration) => this.configurationService.update(configuration));
    electron.ipcMain.handle("config:chooseHolyricsPath", async () => {
      const result = await electron.dialog.showOpenDialog({
        title: "Local do Holyrics",
        properties: ["openFile", "openDirectory"],
        filters: [
          { name: "Holyrics", extensions: ["exe"] },
          { name: "Todos os arquivos", extensions: ["*"] }
        ]
      });
      return result.canceled ? undefined : result.filePaths[0];
    });

    electron.ipcMain.handle("listening:start", async (_event, device: AudioInputDevice) => {
      this.audioService.setSelectedDevice(device);
      this.configurationService.update({ audioDeviceId: device.deviceId, audioDeviceLabel: device.label });
      await this.gladiaService.connect();
      this.status = "listening";
      this.mainWindow?.webContents.send("status:changed", this.status);
    });

    electron.ipcMain.handle("listening:stop", async () => {
      await this.gladiaService.disconnect();
      this.status = "stopped";
      this.mainWindow?.webContents.send("status:changed", this.status);
    });

    electron.ipcMain.handle("audio:chunk", async (_event, chunk: ArrayBuffer) => {
      if (this.status === "listening") {
        await this.gladiaService.sendAudioChunk(chunk);
      }
    });

    electron.ipcMain.handle("session:finish", async () => {
      const path = await this.exportService.exportTranscript(this.transcriptService.all());
      if (path) this.transcriptService.clear();
      return path;
    });

    electron.ipcMain.handle("reference:open", async (_event, reference: BibleReference) => this.openReference(reference));
    electron.ipcMain.handle("reference:ignoreMultiple", () => undefined);
    electron.ipcMain.handle("holyrics:testAutomation", async (_event, configuration: Partial<AppConfiguration> = {}) => {
      const current = this.configurationService.get();
      const previousHolyricsPath = current.holyricsPath;
      if (configuration.holyricsPath && configuration.holyricsPath !== previousHolyricsPath) {
        this.configurationService.update({ holyricsPath: configuration.holyricsPath });
      }

      try {
        await this.holyricsAutomationService.open({
          book: "Mateus",
          chapter: 20,
          verse: 2,
          version: current.bibleVersion || "NAA",
          rawText: "Teste de automacao",
          confidence: 1
        });
      } finally {
        if (configuration.holyricsPath && previousHolyricsPath !== configuration.holyricsPath) {
          this.configurationService.update({ holyricsPath: previousHolyricsPath });
        }
      }
    });
    electron.ipcMain.handle("connections:test", async (_event, configuration: Partial<AppConfiguration> = {}) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const current = this.configurationService.get();
      const testConfiguration = { ...current, ...configuration };

      const gladia = await this.gladiaService.testConnection(testConfiguration.gladiaApiKey).catch((error) => {
        errors.push(`Gladia: ${String(error)}`);
        return false;
      });
      const gemini = await this.geminiService.testConnection(testConfiguration.geminiApiKey).catch((error) => {
        errors.push(`Gemini: ${String(error)}`);
        return false;
      });
      const holyricsStatus = await this.holyricsAutomationService.testConnection(testConfiguration.holyricsPath).catch((error) => {
        errors.push(`Holyrics: ${String(error)}`);
        return { executableFound: false, appRunning: false } satisfies HolyricsConnectionStatus;
      });
      const holyrics = holyricsStatus.executableFound;

      if (!testConfiguration.geminiApiKey) {
        errors.push("Gemini: informe uma API key.");
      } else if (!gemini) {
        errors.push("Gemini: chave invalida, sem permissao, modelo indisponivel ou bloqueio de rede.");
      }

      if (!testConfiguration.holyricsPath) {
        errors.push("Holyrics: informe a pasta de instalacao ou o caminho do Holyrics.exe.");
      } else if (!holyricsStatus.executableFound) {
        errors.push("Holyrics: nao encontrei Holyrics.exe no caminho informado.");
      } else if (!holyricsStatus.appRunning) {
        warnings.push(`Holyrics: executavel encontrado em ${holyricsStatus.executablePath}, mas o Holyrics precisa estar aberto para automacao.`);
      }

      return { gladia, gemini, holyrics, errors, warnings };
    });
  }

  private async handleTranscript(text: string, isFinal: boolean): Promise<void> {
    const line = this.transcriptService.add(text, isFinal);
    this.mainWindow?.webContents.send("transcript:line", line);
    if (!isFinal) return;

    const detection = await this.detector.detect(text);
    if (detection.references.length === 0) return;

    if (detection.needsUserChoice) {
      this.mainWindow?.webContents.send("reference:multiple", detection.references);
      return;
    }

    await this.openReference(detection.references[0]).catch((error) => {
      this.emitError(`Referencia detectada, mas falhou ao abrir no Holyrics: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async openReference(reference: BibleReference): Promise<void> {
    const key = `${reference.book}-${reference.chapter}-${reference.verse}`;
    const lastOpenedAt = this.openedReferences.get(key) ?? 0;
    if (Date.now() - lastOpenedAt < 5000) return;

    try {
      await this.holyricsAutomationService.open(reference);
      this.openedReferences.set(key, Date.now());
      this.lastOpenedReference = reference;
      this.mainWindow?.webContents.send("reference:last", reference);
    } catch (error) {
      this.logger.error("Failed to open reference.", error);
      throw error;
    }
  }

  private emitError(message: string): void {
    this.logger.error(message);
    this.mainWindow?.webContents.send("app:error", message);
  }
}
