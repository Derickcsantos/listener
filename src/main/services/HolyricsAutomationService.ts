import { clipboard } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BibleReference } from "../../types/domain.js";
import type { IConfigurationService, IHolyricsAutomationService, ILoggerService } from "../interfaces/services.js";
import { formatReference } from "../utils/text.js";

const execFileAsync = promisify(execFile);

export class HolyricsAutomationService implements IHolyricsAutomationService {
  constructor(
    private readonly configurationService: IConfigurationService,
    private readonly logger: ILoggerService
  ) {}

  async open(reference: BibleReference): Promise<void> {
    const configuration = this.configurationService.get();
    if (!configuration.holyricsPath) {
      throw new Error("Local do Holyrics nao configurado.");
    }

    const query = formatReference(reference);
    clipboard.writeText(query);

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
      }
"@
      $process = Get-Process | Where-Object { $_.ProcessName -like "Holyrics*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if (-not $process) { throw "Holyrics aberto nao encontrado." }
      [Win32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
      Start-Sleep -Milliseconds 250
      [System.Windows.Forms.SendKeys]::SendWait("^f")
      Start-Sleep -Milliseconds 100
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      Start-Sleep -Milliseconds 100
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    `;

    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
        windowsHide: true
      });
      this.logger.info(`Opened reference in Holyrics: ${query}`);
    } catch (error) {
      this.logger.error("Holyrics automation failed.", error);
      throw error;
    }
  }
}
