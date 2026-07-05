import type { BibleListenerApi } from "./ipc";

declare global {
  interface Window {
    bibleListener: BibleListenerApi;
  }
}

export {};
