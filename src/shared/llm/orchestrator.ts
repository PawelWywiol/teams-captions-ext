import { generateAnalysis } from "../../api/client.js";
import { findChunkByHash, getSessionEntries, saveChunk, saveSummary } from "../db/index.js";
import type { StoredSummary } from "../db/schema.js";
import { loadSettings } from "../storage.js";
import type { CaptionEntry } from "../types.js";
import { chunkEntries, type CaptionChunk } from "./chunker.js";
import { hashChunk, hashPrompt } from "./hasher.js";
import { buildMapPayload, buildReducePayload } from "./payload.js";

export type AnalyzeOptions = {
  userPrompt?: string;
};

export type AnalyzeResult = {
  summary: StoredSummary;
  fromCache: { map: number; total: number };
};

async function mapChunk(
  sessionId: string,
  chunk: CaptionChunk,
  settings: Awaited<ReturnType<typeof loadSettings>>,
): Promise<{ hash: string; summary: string; cached: boolean }> {
  const hash = await hashChunk(chunk);
  const existing = await findChunkByHash(sessionId, hash);
  if (existing) return { hash, summary: existing.summary, cached: true };

  const summary = await generateAnalysis(settings, buildMapPayload(chunk, settings));
  await saveChunk({
    id: crypto.randomUUID(),
    sessionId,
    hash,
    rangeStart: chunk.start,
    rangeEnd: chunk.end,
    summary,
    createdAt: new Date().toISOString(),
  });
  return { hash, summary, cached: false };
}

export async function analyzeSession(
  sessionId: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const rawEntries = await getSessionEntries(sessionId);
  const entries: CaptionEntry[] = rawEntries.map(({ sessionId: _ignored, ...rest }) => rest);
  if (!entries.length) throw new Error("No captions to analyse");

  const chunks = chunkEntries(entries);
  const settings = await loadSettings();
  const userPrompt = options.userPrompt?.trim() ?? "";

  let cachedHits = 0;
  const mapped: Array<{ hash: string; summary: string }> = [];
  for (const chunk of chunks) {
    const result = await mapChunk(sessionId, chunk, settings);
    if (result.cached) cachedHits += 1;
    mapped.push({ hash: result.hash, summary: result.summary });
  }

  const promptHash = await hashPrompt({
    chunkHashes: mapped.map((m) => m.hash),
    userPrompt,
  });

  const content = await generateAnalysis(
    settings,
    buildReducePayload(
      mapped.map((m) => m.summary),
      userPrompt,
      settings,
    ),
  );

  const summary: StoredSummary = {
    id: crypto.randomUUID(),
    sessionId,
    promptHash,
    content,
    chunkHashes: mapped.map((m) => m.hash),
    createdAt: new Date().toISOString(),
  };
  await saveSummary(summary);

  return { summary, fromCache: { map: cachedHits, total: chunks.length } };
}
