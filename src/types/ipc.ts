import type { AppConfiguration, AppSnapshot, AudioInputDevice, BibleReference, TranscriptLine } from "./domain.js";

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
  testConnections(): Promise<{ gladia: boolean; gemini: boolean; errors: string[] }>;
  onStatusChanged(callback: (status: AppSnapshot["status"]) => void): () => void;
  onTranscriptLine(callback: (line: TranscriptLine) => void): () => void;
  onLastReference(callback: (reference: BibleReference) => void): () => void;
  onMultipleReferences(callback: (references: BibleReference[]) => void): () => void;
  onError(callback: (message: string) => void): () => void;
}
