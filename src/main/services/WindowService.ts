import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { join } from "node:path";
import type { AppStatus, AudioInputDevice, BibleReference } from "../../types/domain.js";
import type {
  IAudioService,
  IBibleCommandDetector,
  IConfigurationService,
  IExportService,
  IGeminiService,
  IGladiaService,
  IHolyricsAutomationService,
  ILoggerService,
  ITranscriptService
} from "../interfaces/services.js";

export class WindowService {
  private mainWindow?: BrowserWindow;
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
    this.mainWindow = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 640,
      title: "Bible Listener",
      webPreferences: {
        preload: join(app.getAppPath(), "dist/preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      void this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      void this.mainWindow.loadFile(join(app.getAppPath(), "dist/renderer/index.html"));
    }
  }

  registerIpc(): void {
    this.gladiaService.on("transcript", (...args: unknown[]) => {
      void this.handleTranscript(String(args[0] ?? ""), Boolean(args[1]));
    });
    this.gladiaService.on("error", (...args: unknown[]) => this.emitError(String(args[0] ?? "Erro no Gladia.")));

    ipcMain.handle("app:getSnapshot", () => ({
      status: this.status,
      configuration: this.configurationService.get(),
      transcriptLines: this.transcriptService.all(),
      lastOpenedReference: this.lastOpenedReference
    }));

    ipcMain.handle("config:save", (_event, configuration) => this.configurationService.update(configuration));
    ipcMain.handle("config:chooseHolyricsPath", async () => {
      const result = await dialog.showOpenDialog({
        title: "Local do Holyrics",
        properties: ["openDirectory"]
      });
      return result.canceled ? undefined : result.filePaths[0];
    });

    ipcMain.handle("listening:start", async (_event, device: AudioInputDevice) => {
      this.audioService.setSelectedDevice(device);
      this.configurationService.update({ audioDeviceId: device.deviceId, audioDeviceLabel: device.label });
      await this.gladiaService.connect();
      this.status = "listening";
      this.mainWindow?.webContents.send("status:changed", this.status);
    });

    ipcMain.handle("listening:stop", async () => {
      await this.gladiaService.disconnect();
      this.status = "stopped";
      this.mainWindow?.webContents.send("status:changed", this.status);
    });

    ipcMain.handle("audio:chunk", async (_event, chunk: ArrayBuffer) => {
      if (this.status === "listening") {
        await this.gladiaService.sendAudioChunk(chunk);
      }
    });

    ipcMain.handle("session:finish", async () => {
      const path = await this.exportService.exportTranscript(this.transcriptService.all());
      if (path) this.transcriptService.clear();
      return path;
    });

    ipcMain.handle("reference:open", async (_event, reference: BibleReference) => this.openReference(reference));
    ipcMain.handle("reference:ignoreMultiple", () => undefined);
    ipcMain.handle("connections:test", async () => {
      const errors: string[] = [];
      const gladia = await this.gladiaService.testConnection().catch((error) => {
        errors.push(String(error));
        return false;
      });
      const gemini = await this.geminiService.testConnection().catch((error) => {
        errors.push(String(error));
        return false;
      });
      return { gladia, gemini, errors };
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

    await this.openReference(detection.references[0]);
  }

  private async openReference(reference: BibleReference): Promise<void> {
    const key = `${reference.book}-${reference.chapter}-${reference.verse}`;
    const lastOpenedAt = this.openedReferences.get(key) ?? 0;
    if (Date.now() - lastOpenedAt < 5000) return;

    await this.holyricsAutomationService.open(reference);
    this.openedReferences.set(key, Date.now());
    this.lastOpenedReference = reference;
    this.mainWindow?.webContents.send("reference:last", reference);
  }

  private emitError(message: string): void {
    this.logger.error(message);
    this.mainWindow?.webContents.send("app:error", message);
  }
}
