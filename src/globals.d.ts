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
    onMessage: {
      addListener(listener: (message: any) => unknown): void;
    };
  };
  tabs: {
    create(properties: { url: string; active?: boolean }): Promise<unknown>;
  };
};
