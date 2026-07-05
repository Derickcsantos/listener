import * as electron from "electron";
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
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
    electron.clipboard.writeText(query);

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

  async testConnection(holyricsPath = this.configurationService.get().holyricsPath): Promise<boolean> {
    if (!holyricsPath) return false;

    try {
      await resolveHolyricsExecutable(holyricsPath);
      if (process.platform !== "win32") {
        return true;
      }

      const script = `
        $process = Get-Process | Where-Object { $_.ProcessName -like "Holyrics*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($process) { exit 0 }
        exit 1
      `;
      await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
        windowsHide: true
      });
      return true;
    } catch (error) {
      this.logger.warn("Holyrics connection test failed.", error);
      return false;
    }
  }
}

async function resolveHolyricsExecutable(holyricsPath: string): Promise<string> {
  const info = await stat(holyricsPath);
  const candidates = info.isDirectory()
    ? [join(holyricsPath, "Holyrics.exe"), join(holyricsPath, "holyrics.exe")]
    : [holyricsPath];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common executable name.
    }
  }

  throw new Error("Executavel do Holyrics nao encontrado no caminho informado.");
}
