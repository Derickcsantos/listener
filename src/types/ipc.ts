import type { AppConfiguration, AppSnapshot, AudioInputDevice, BibleReference, TranscriptLine } from "./domain.js";

export interface HolyricsAutomationTestResult {
  success: boolean;
  confirmed: boolean;
  logs: string[];
  diagnosticPath?: string;
}

export interface ConnectionTestResult {
  gladia: boolean;
  gemini: boolean;
  holyrics: boolean;
  errors: string[];
  warnings: string[];
}

export interface BibleListenerApi {
  getSnapshot(): Promise<AppSnapshot>;
  saveConfiguration(configuration: Partial<AppConfiguration>): Promise<AppConfiguration>;
  chooseHolyricsPath(): Promise<string | undefined>;
  startListening(device: AudioInputDevice): Promise<void>;
  stopListening(): Promise<void>;
  sendAudioChunk(chunk: ArrayBuffer): Promise<void>;
  finishSession(): Promise<string | undefined>;
  openReference(reference: BibleReference): Promise<void>;
  ignoreMultipleReferences(): Promise<void>;
  testConnections(configuration?: Partial<AppConfiguration>): Promise<ConnectionTestResult>;
  testHolyricsAutomation(configuration?: Partial<AppConfiguration>): Promise<HolyricsAutomationTestResult>;
  onStatusChanged(callback: (status: AppSnapshot["status"]) => void): () => void;
  onTranscriptLine(callback: (line: TranscriptLine) => void): () => void;
  onLastReference(callback: (reference: BibleReference) => void): () => void;
  onMultipleReferences(callback: (references: BibleReference[]) => void): () => void;
  onError(callback: (message: string) => void): () => void;
}
