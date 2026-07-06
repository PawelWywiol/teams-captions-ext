declare const browser: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(value: Record<string, unknown>): Promise<void>;
    };
    session: {
      get(key: string): Promise<Record<string, unknown>>;
      set(value: Record<string, unknown>): Promise<void>;
    };
  };
  permissions: {
    contains(details: { origins: string[] }): Promise<boolean>;
    request(details: { origins: string[] }): Promise<boolean>;
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage(): Promise<void>;
    getURL(path: string): string;
    getManifest?(): { version: string; [key: string]: unknown };
    onMessage: {
      addListener(listener: (message: any) => unknown): void;
    };
  };
  tabs: {
    create(properties: { url: string; active?: boolean }): Promise<unknown>;
    query?(query: { url?: string | string[] }): Promise<Array<{ id?: number; url?: string }>>;
    onUpdated?: {
      addListener(
        listener: (
          tabId: number,
          changeInfo: { status?: string; url?: string },
          tab: { id?: number; url?: string },
        ) => void,
      ): void;
    };
  };
  scripting?: {
    executeScript(args: {
      target: { tabId: number; allFrames?: boolean };
      files?: string[];
      func?: (...args: any[]) => unknown;
      args?: unknown[];
      world?: "ISOLATED" | "MAIN";
    }): Promise<Array<{ result?: unknown }>>;
  };
};
