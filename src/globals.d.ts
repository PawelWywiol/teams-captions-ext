declare const browser: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(value: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage(): Promise<void>;
    onMessage: {
      addListener(listener: (message: any) => unknown): void;
    };
  };
};
