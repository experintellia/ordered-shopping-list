// y-webxdc ships as a plain .mjs with no type declarations.
declare module "y-webxdc" {
  import type { Doc } from "yjs";

  export interface EditInfo {
    document: string;
    summary: string;
    startinfo: string;
  }

  export interface WebxdcProviderOptions {
    webxdc: typeof window.webxdc;
    ydoc: Doc;
    getEditInfo: () => EditInfo;
    autosaveInterval: number;
    resendAllUpdates?: boolean;
  }

  export default class WebxdcProvider {
    constructor(options: WebxdcProviderOptions);
    syncToChatPeers(): void;
    resendAllUpdates: boolean;
    on(name: "sync", handler: (e: { hasQueued: boolean }) => void): void;
  }
}

// Side-effect CSS imports handled by Vite.
declare module "*.css";
