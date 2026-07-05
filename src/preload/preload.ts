import { contextBridge, ipcRenderer } from "electron";
import type { AppConfiguration, AudioInputDevice, BibleReference, TranscriptLine } from "../types/domain.js";
import type { BibleListenerApi } from "../types/ipc.js";

const api: BibleListenerApi = {
  getSnapshot: () => ipcRenderer.invoke("app:getSnapshot"),
  saveConfiguration: (configuration: Partial<AppConfiguration>) => ipcRenderer.invoke("config:save", configuration),
  chooseHolyricsPath: () => ipcRenderer.invoke("config:chooseHolyricsPath"),
  startListening: (device: AudioInputDevice) => ipcRenderer.invoke("listening:start", device),
  stopListening: () => ipcRenderer.invoke("listening:stop"),
  sendAudioChunk: (chunk: ArrayBuffer) => ipcRenderer.invoke("audio:chunk", chunk),
  finishSession: () => ipcRenderer.invoke("session:finish"),
  openReference: (reference: BibleReference) => ipcRenderer.invoke("reference:open", reference),
  ignoreMultipleReferences: () => ipcRenderer.invoke("reference:ignoreMultiple"),
  testConnections: (configuration?: Partial<AppConfiguration>) => ipcRenderer.invoke("connections:test", configuration),
  onStatusChanged: (callback) => subscribe("status:changed", callback),
  onTranscriptLine: (callback) => subscribe("transcript:line", callback),
  onLastReference: (callback) => subscribe("reference:last", callback),
  onMultipleReferences: (callback) => subscribe("reference:multiple", callback),
  onError: (callback) => subscribe("app:error", callback)
};

contextBridge.exposeInMainWorld("bibleListener", api);

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}
