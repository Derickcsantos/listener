import type { AppConfiguration, AudioInputDevice, BibleReference, DetectionResult, TranscriptLine } from "../../types/domain.js";

export interface IConfigurationService {
  get(): AppConfiguration;
  update(configuration: Partial<AppConfiguration>): AppConfiguration;
}

export interface ITranscriptService {
  add(text: string, isFinal: boolean): TranscriptLine;
  all(): TranscriptLine[];
  clear(): void;
}

export interface IBibleReferenceParser {
  parse(text: string): BibleReference[];
}

export interface IGeminiService {
  interpret(text: string): Promise<BibleReference[]>;
  testConnection(): Promise<boolean>;
}

export interface IBibleCommandDetector {
  detect(text: string): Promise<DetectionResult>;
}

export interface IGladiaService {
  on(event: "transcript", listener: (text: string, isFinal: boolean) => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendAudioChunk(chunk: ArrayBuffer): Promise<void>;
  testConnection(): Promise<boolean>;
}

export interface IHolyricsAutomationService {
  open(reference: BibleReference): Promise<void>;
}

export interface IExportService {
  exportTranscript(lines: TranscriptLine[]): Promise<string | undefined>;
}

export interface IAudioService {
  setSelectedDevice(device: AudioInputDevice): void;
  getSelectedDevice(): AudioInputDevice | undefined;
}

export interface ILoggerService {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
