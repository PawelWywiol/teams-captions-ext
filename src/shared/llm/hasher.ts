import type { CaptionChunk } from "./chunker.js";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

function normalize(chunk: CaptionChunk): string {
  return chunk.entries.map((e) => `${e.ts}|${e.speakerOriginal ?? ""}|${e.text}`).join("\n");
}

export function hashChunk(chunk: CaptionChunk): Promise<string> {
  return sha256Hex(normalize(chunk));
}

export function hashPrompt(parts: { chunkHashes: string[]; userPrompt: string }): Promise<string> {
  return sha256Hex(`${parts.chunkHashes.join(",")}::${parts.userPrompt}`);
}
