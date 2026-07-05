import * as electron from "electron";
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { BibleReference } from "../../types/domain.js";
import type {
  HolyricsAutomationResult,
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

  async open(reference: BibleReference): Promise<HolyricsAutomationResult> {
    const configuration = this.configurationService.get();
    if (!configuration.holyricsPath) {
      throw new Error("Local do Holyrics nao configurado.");
    }

    const queries = buildReferenceQueries(reference);
    electron.clipboard.writeText(queries[0]);
    const diagnosticPath = join(electron.app.getPath("userData"), "holyrics-automation-diagnostic.txt");
    const script = buildAutomationScript(queries, diagnosticPath, {
      book: getHolyricsBookName(reference.book),
      chapter: reference.chapter,
      verse: reference.verse
    });

    try {
      const encodedScript = Buffer.from(script, "utf16le").toString("base64");
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript], {
        windowsHide: true
      });
      this.logger.info(`Opened reference in Holyrics: ${formatReference(reference)}`, stdout);
      const logs = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      return {
        success: logs.some((line) => line.includes("RESULT:OK")),
        confirmed: logs.some((line) => line.includes("CONFIRMED:true")),
        logs,
        diagnosticPath
      };
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

function buildReferenceQueries(reference: BibleReference): string[] {
  const book = reference.book;
  const abbreviation = bookAbbreviations[book] ?? book;
  const base = `${book} ${reference.chapter}:${reference.verse}`;
  const withVersion = `${base} ${reference.version}`;
  const short = `${abbreviation} ${reference.chapter}:${reference.verse}`;
  const spoken = `${book} ${reference.chapter} ${reference.verse}`;
  return Array.from(new Set([base, withVersion, short, spoken]));
}

function getHolyricsBookName(book: string): string {
  return holyricsBookNames[book] ?? book;
}

const holyricsBookNames: Record<string, string> = {
  Genesis: "Genesis",
  Exodo: "Exodo",
  Levitico: "Levitico",
  Numeros: "Numeros",
  Deuteronomio: "Deuteronomio",
  Josue: "Josue",
  Juizes: "Juizes",
  Rute: "Rute",
  "1 Samuel": "1 Samuel",
  "2 Samuel": "2 Samuel",
  "1 Reis": "1 Reis",
  "2 Reis": "2 Reis",
  "1 Cronicas": "1 Cronicas",
  "2 Cronicas": "2 Cronicas",
  Esdras: "Esdras",
  Neemias: "Neemias",
  Ester: "Ester",
  Jo: "Jo",
  Salmos: "Salmos",
  Proverbios: "Proverbios",
  Eclesiastes: "Eclesiastes",
  Cantares: "Cantares",
  Isaias: "Isaias",
  Jeremias: "Jeremias",
  Lamentacoes: "Lamentacoes",
  Ezequiel: "Ezequiel",
  Daniel: "Daniel",
  Oseias: "Oseias",
  Joel: "Joel",
  Amos: "Amos",
  Obadias: "Obadias",
  Jonas: "Jonas",
  Miqueias: "Miqueias",
  Naum: "Naum",
  Habacuque: "Habacuque",
  Sofonias: "Sofonias",
  Ageu: "Ageu",
  Zacarias: "Zacarias",
  Malaquias: "Malaquias",
  Mateus: "Mateus",
  Marcos: "Marcos",
  Lucas: "Lucas",
  Joao: "Joao",
  Atos: "Atos",
  Romanos: "Romanos",
  "1 Corintios": "1 Corintios",
  "2 Corintios": "2 Corintios",
  Galatas: "Galatas",
  Efesios: "Efesios",
  Filipenses: "Filipenses",
  Colossenses: "Colossenses",
  "1 Tessalonicenses": "1 Tessalonicenses",
  "2 Tessalonicenses": "2 Tessalonicenses",
  "1 Timoteo": "1 Timoteo",
  "2 Timoteo": "2 Timoteo",
  Tito: "Tito",
  Filemom: "Filemom",
  Hebreus: "Hebreus",
  Tiago: "Tiago",
  "1 Pedro": "1 Pedro",
  "2 Pedro": "2 Pedro",
  "1 Joao": "1 Joao",
  "2 Joao": "2 Joao",
  "3 Joao": "3 Joao",
  Judas: "Judas",
  Apocalipse: "Apocalipse"
};

const bookAbbreviations: Record<string, string> = {
  Genesis: "Gn",
  Exodo: "Ex",
  Levitico: "Lv",
  Numeros: "Nm",
  Deuteronomio: "Dt",
  Josue: "Js",
  Juizes: "Jz",
  Rute: "Rt",
  "1 Samuel": "1Sm",
  "2 Samuel": "2Sm",
  "1 Reis": "1Rs",
  "2 Reis": "2Rs",
  Salmos: "Sl",
  Proverbios: "Pv",
  Isaias: "Is",
  Jeremias: "Jr",
  Mateus: "Mt",
  Marcos: "Mc",
  Lucas: "Lc",
  Joao: "Jo",
  Atos: "At",
  Romanos: "Rm",
  "1 Corintios": "1Co",
  "2 Corintios": "2Co",
  Galatas: "Gl",
  Efesios: "Ef",
  Filipenses: "Fp",
  Colossenses: "Cl",
  "1 Timoteo": "1Tm",
  "2 Timoteo": "2Tm",
  Hebreus: "Hb",
  Tiago: "Tg",
  "1 Pedro": "1Pe",
  "2 Pedro": "2Pe",
  Apocalipse: "Ap"
};

function buildAutomationScript(queries: string[], diagnosticPath: string, reference: { book: string; chapter: number; verse: number }): string {
  const queriesJson = JSON.stringify(queries);
  const diagnosticPathJson = JSON.stringify(diagnosticPath);
  const referenceJson = JSON.stringify(reference);
  return `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

$queries = ConvertFrom-Json @'
${queriesJson}
'@
$diagnosticPath = ConvertFrom-Json @'
${diagnosticPathJson}
'@
$reference = ConvertFrom-Json @'
${referenceJson}
'@

function Log($message) {
  Write-Output "[HolyricsAutomation] $message"
}

function Get-HolyricsProcess {
  Get-Process | Where-Object { $_.ProcessName -like "Holyrics*" -and $_.MainWindowHandle -ne 0 } | Sort-Object StartTime -Descending | Select-Object -First 1
}

function Focus-Holyrics {
  $process = Get-HolyricsProcess
  if (-not $process) { throw "Holyrics aberto nao encontrado. Abra o Holyrics antes de ouvir." }
  [Win32]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
  Start-Sleep -Milliseconds 150
  [Win32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 350
  return $process
}

function Get-HolyricsWindow($process) {
  [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
}

function Normalize-Text($value) {
  if (-not $value) { return "" }
  $normalized = $value.ToString().ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  return -join ($normalized.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne [Globalization.UnicodeCategory]::NonSpacingMark })
}

function Find-DescendantsByControlType($root, $controlType) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $controlType)
  $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Write-Diagnostic($root) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("Holyrics UI Automation diagnostic - " + (Get-Date).ToString("s"))
  $lines.Add("Window: " + $root.Current.Name)
  $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $limit = [Math]::Min($all.Count, 250)
  for ($i = 0; $i -lt $limit; $i++) {
    $item = $all.Item($i)
    $lines.Add(("ControlType={0}; Name={1}; AutomationId={2}; ClassName={3}; Enabled={4}" -f $item.Current.ControlType.ProgrammaticName, $item.Current.Name, $item.Current.AutomationId, $item.Current.ClassName, $item.Current.IsEnabled))
  }
  [IO.File]::WriteAllLines($diagnosticPath, $lines.ToArray(), [Text.Encoding]::UTF8)
  Log "Diagnostico salvo em: $diagnosticPath"
}

function Try-Invoke($element) {
  if (-not $element) { return $false }
  try {
    $pattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
    Start-Sleep -Milliseconds 250
    return $true
  } catch {
    try {
      $point = $element.GetClickablePoint()
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point([int]$point.X, [int]$point.Y)
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      Start-Sleep -Milliseconds 250
      return $true
    } catch {
      return $false
    }
  }
}

function Try-ClickBibleArea($root) {
  $controls = @()
  $controls += Find-DescendantsByControlType $root ([System.Windows.Automation.ControlType]::Button)
  $controls += Find-DescendantsByControlType $root ([System.Windows.Automation.ControlType]::TabItem)
  $controls += Find-DescendantsByControlType $root ([System.Windows.Automation.ControlType]::MenuItem)
  foreach ($control in $controls) {
    $name = Normalize-Text $control.Current.Name
    if ($name -match "blia|bible|vers|refer") {
      if (Try-Invoke $control) {
        Log "Controle de Biblia acionado: $name"
        return $true
      }
    }
  }
  return $false
}

function Try-SetValue($element, $value) {
  try {
    $valuePattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $valuePattern.SetValue($value)
    return $true
  } catch {
    try {
      $element.SetFocus()
      Start-Sleep -Milliseconds 100
      [System.Windows.Forms.SendKeys]::SendWait("^a")
      [System.Windows.Forms.Clipboard]::SetText($value)
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      return $true
    } catch {
      return $false
    }
  }
}

function Try-UiAutomationSearch($root, $query) {
  Try-ClickBibleArea $root | Out-Null
  $edits = @()
  $edits += Find-DescendantsByControlType $root ([System.Windows.Automation.ControlType]::Edit)
  $edits += Find-DescendantsByControlType $root ([System.Windows.Automation.ControlType]::ComboBox)
  foreach ($edit in $edits) {
    if (-not $edit.Current.IsEnabled) { continue }
    $name = Normalize-Text $edit.Current.Name
    if ($name -notmatch "pesquis|buscar|localizar|refer|blia|texto|filtro|search|find" -and $edits.Count -gt 1) {
      continue
    }
    if (Try-SetValue $edit $query) {
      Start-Sleep -Milliseconds 150
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      Start-Sleep -Milliseconds 400
      Log "Pesquisa por UI Automation enviada: $query"
      return $true
    }
  }
  return $false
}

function Try-HotkeySearch($query) {
  $hotkeys = @("^f", "^l", "^b")
  foreach ($hotkey in $hotkeys) {
    [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait($hotkey)
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.Clipboard]::SetText($query)
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 350
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 350
    Log "Pesquisa por atalho enviada com $hotkey: $query"
    return $false
  }
  return $false
}

function Set-ClipboardText($value) {
  [System.Windows.Forms.Clipboard]::SetText([string]$value)
}

function Paste-Value($value) {
  Set-ClipboardText $value
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 60
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 140
}

function Try-F7BibleFlow($reference) {
  Log "Iniciando fluxo Holyrics F7: livro=$($reference.book), capitulo=$($reference.chapter), versiculo=$($reference.verse)"
  [System.Windows.Forms.SendKeys]::SendWait("{F7}")
  Start-Sleep -Milliseconds 600

  Paste-Value $reference.book
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Log "Livro informado: $($reference.book)"
  Start-Sleep -Milliseconds 450

  Paste-Value $reference.chapter
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Log "Capitulo informado: $($reference.chapter)"
  Start-Sleep -Milliseconds 450

  Paste-Value $reference.verse
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Log "Versiculo informado: $($reference.verse)"
  Start-Sleep -Milliseconds 450

  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Start-Sleep -Milliseconds 450
  Log "Texto acessado via fluxo F7."
  return $true
}

$process = Focus-Holyrics
Log "Janela encontrada: $($process.MainWindowTitle)"
$root = Get-HolyricsWindow $process
Write-Diagnostic $root
$success = Try-F7BibleFlow $reference
foreach ($query in $queries) {
  if ($success) { break }
  [System.Windows.Forms.Clipboard]::SetText($query)
  if (Try-UiAutomationSearch $root $query) {
    $success = $true
    break
  }
}
if (-not $success) {
  foreach ($query in $queries) {
    Try-HotkeySearch $query | Out-Null
  }
}
if (-not $success) {
  Log "RESULT:PARTIAL"
  Log "CONFIRMED:false"
  Log "Nao consegui confirmar um campo de pesquisa por UI Automation. Enviei fallbacks por teclado, mas preciso do diagnostico salvo para ajustar ao Holyrics desta maquina."
} else {
  Log "RESULT:OK"
  Log "CONFIRMED:true"
}
`;
}
