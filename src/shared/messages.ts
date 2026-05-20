import type { RuntimeMessage } from "./types.js";

export function sendRuntimeMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
