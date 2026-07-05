export type AppStatus = "stopped" | "listening";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface AppConfiguration {
  gladiaApiKey?: string;
  geminiApiKey?: string;
  audioDeviceId?: string;
  audioDeviceLabel?: string;
  holyricsPath?: string;
  bibleVersion: string;
}

export interface BibleReference {
  book: string;
  chapter: number;
  verse: number;
  version: string;
  rawText: string;
  confidence: number;
}

export interface DetectionResult {
  references: BibleReference[];
  needsUserChoice: boolean;
  source: "regex" | "gemini" | "none";
}

export interface TranscriptLine {
  id: string;
  text: string;
  createdAt: string;
  isFinal: boolean;
}

export interface AppSnapshot {
  status: AppStatus;
  configuration: AppConfiguration;
  transcriptLines: TranscriptLine[];
  lastOpenedReference?: BibleReference;
}
