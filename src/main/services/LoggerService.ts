import type { ILoggerService } from "../interfaces/services.js";

export class LoggerService implements ILoggerService {
  info(message: string, meta?: unknown): void {
    console.info(`[Bible Listener] ${message}`, meta ?? "");
  }

  warn(message: string, meta?: unknown): void {
    console.warn(`[Bible Listener] ${message}`, meta ?? "");
  }

  error(message: string, meta?: unknown): void {
    console.error(`[Bible Listener] ${message}`, meta ?? "");
  }
}
