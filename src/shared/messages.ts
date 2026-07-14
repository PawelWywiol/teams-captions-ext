import type { ErrorResponse, RuntimeMessage } from "./types.js";

export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    typeof (response as ErrorResponse).__error === "string"
  );
}

export async function sendRuntimeMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (response === undefined || response === null) {
    // A dropped response (stale/mismatched background) must not surface as a
    // silent `undefined` that crashes callers downstream.
    throw new Error(`No response for ${message.type} — reload the extension`);
  }
  if (isErrorResponse(response)) {
    throw new Error(response.__error);
  }
  return response as T;
}
