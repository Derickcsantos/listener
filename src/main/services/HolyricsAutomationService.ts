import * as electron from "electron";
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { BibleReference } from "../../types/domain.js";
import type {
  HolyricsConnectionStatus,
  IConfigurationService,
  IHolyricsAutomationService,
  ILoggerService
} from "../interfaces/services.js";
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

  async testConnection(holyricsPath = this.configurationService.get().holyricsPath): Promise<HolyricsConnectionStatus> {
    if (!holyricsPath) {
      return { executableFound: false, appRunning: false };
    }

    try {
      const executablePath = await resolveHolyricsExecutable(holyricsPath);
      const appRunning = process.platform === "win32" ? await isHolyricsRunning() : true;
      return { executableFound: true, appRunning, executablePath };
    } catch (error) {
      this.logger.warn("Holyrics connection test failed.", error);
      return { executableFound: false, appRunning: false };
    }
  }
}

async function resolveHolyricsExecutable(holyricsPath: string): Promise<string> {
  const normalizedPath = cleanWindowsPath(holyricsPath);
  const info = await stat(normalizedPath);
  const candidates = info.isDirectory()
    ? [
        join(normalizedPath, "Holyrics.exe"),
        join(normalizedPath, "holyrics.exe"),
        join(normalizedPath, "app", "Holyrics.exe"),
        join(normalizedPath, "bin", "Holyrics.exe")
      ]
    : [normalizedPath];

  for (const candidate of candidates) {
    try {
      await assertHolyricsExecutable(candidate);
      return candidate;
    } catch {
      // Try the next common executable name.
    }
  }

  if (info.isDirectory()) {
    const recursiveMatch = await findHolyricsExecutable(normalizedPath, 3);
    if (recursiveMatch) return recursiveMatch;
  }

  throw new Error("Executavel do Holyrics nao encontrado no caminho informado.");
}

async function assertHolyricsExecutable(candidate: string): Promise<void> {
  const info = await stat(candidate);
  if (!info.isFile()) {
    throw new Error("Caminho encontrado nao e arquivo.");
  }
  if (process.platform === "win32" && extname(candidate).toLowerCase() !== ".exe") {
    throw new Error("Arquivo encontrado nao e executavel .exe.");
  }
  if (!basename(candidate).toLowerCase().includes("holyrics")) {
    throw new Error("Executavel encontrado nao parece ser o Holyrics.");
  }
  await access(candidate);
}

async function findHolyricsExecutable(directory: string, depth: number): Promise<string | undefined> {
  if (depth < 0) return undefined;

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const candidate = join(directory, entry.name);
    if (entry.name.toLowerCase() === "holyrics.exe") {
      await assertHolyricsExecutable(candidate);
      return candidate;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = await findHolyricsExecutable(join(directory, entry.name), depth - 1);
    if (match) return match;
  }

  return undefined;
}

async function isHolyricsRunning(): Promise<boolean> {
  const script = `
    $process = Get-Process | Where-Object { $_.ProcessName -like "Holyrics*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($process) { exit 0 }
    exit 1
  `;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

function cleanWindowsPath(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}
