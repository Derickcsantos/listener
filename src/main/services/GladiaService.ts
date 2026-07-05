import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { IGladiaService, IConfigurationService, ILoggerService } from "../interfaces/services.js";

type GladiaEvents = "transcript" | "error";

interface GladiaLiveSession {
  url?: string;
  websocket_url?: string;
}

export class GladiaService extends EventEmitter implements IGladiaService {
  private socket?: WebSocket;

  constructor(
    private readonly configurationService: IConfigurationService,
    private readonly logger: ILoggerService
  ) {
    super();
  }

  override on(event: "transcript", listener: (text: string, isFinal: boolean) => void): this;
  override on(event: "error", listener: (error: unknown) => void): this;
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  async connect(): Promise<void> {
    const apiKey = this.configurationService.get().gladiaApiKey;
    if (!apiKey) {
      throw new Error("GLADIA_API_KEY nao configurada.");
    }

    const liveSession = await fetch("https://api.gladia.io/v2/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gladia-key": apiKey
      },
      body: JSON.stringify({
        encoding: "wav/pcm",
        bit_depth: 16,
        sample_rate: 16000,
        channels: 1,
        language_config: {
          languages: ["pt"],
          code_switching: false
        }
      })
    });

    if (!liveSession.ok) {
      throw new Error(`Gladia live session failed with ${liveSession.status}`);
    }

    const session = (await liveSession.json()) as GladiaLiveSession;
    const websocketUrl = session.websocket_url ?? session.url;
    if (!websocketUrl) {
      throw new Error("Gladia nao retornou URL de streaming.");
    }

    this.socket = new WebSocket(websocketUrl);
    this.socket.on("message", (data) => this.handleMessage(String(data)));
    this.socket.on("error", (error) => {
      this.logger.error("Gladia websocket error.", error);
      this.emit("error", error);
    });

    await new Promise<void>((resolve, reject) => {
      this.socket?.once("open", () => resolve());
      this.socket?.once("error", reject);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop_recording" }));
      this.socket.close();
    }
    this.socket = undefined;
  }

  async sendAudioChunk(chunk: ArrayBuffer): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(Buffer.from(chunk));
  }

  async testConnection(): Promise<boolean> {
    const apiKey = this.configurationService.get().gladiaApiKey;
    if (!apiKey) return false;

    const response = await fetch("https://api.gladia.io/v2/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gladia-key": apiKey
      },
      body: JSON.stringify({
        encoding: "wav/pcm",
        bit_depth: 16,
        sample_rate: 16000,
        channels: 1
      })
    });

    return response.ok;
  }

  private handleMessage(message: string): void {
    try {
      const payload = JSON.parse(message) as Record<string, unknown>;
      const transcript = extractTranscript(payload);
      if (transcript) {
        this.emit("transcript", transcript.text, transcript.isFinal);
      }
    } catch (error) {
      this.logger.warn("Unable to parse Gladia message.", error);
    }
  }
}

function extractTranscript(payload: Record<string, unknown>): { text: string; isFinal: boolean } | undefined {
  const direct = payload.transcript;
  if (typeof direct === "string") {
    return { text: direct, isFinal: Boolean(payload.is_final ?? payload.final) };
  }

  const data = payload.data as Record<string, unknown> | undefined;
  const utterance = data?.utterance as Record<string, unknown> | undefined;
  const text = utterance?.text ?? data?.transcript;
  if (typeof text === "string") {
    return { text, isFinal: Boolean(utterance?.is_final ?? data?.is_final ?? payload.is_final) };
  }

  return undefined;
}
