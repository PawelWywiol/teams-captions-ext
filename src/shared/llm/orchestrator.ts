import { generateAnalysis } from "../../api/client.js";
import {
  findChunkByHash,
  getSessionEntries,
  latestSummary,
  patchProgress,
  saveChunk,
  saveSummary,
} from "../db/index.js";
import type { StoredSummary } from "../db/schema.js";
import { loadSettings } from "../storage.js";
import type { CaptionEntry } from "../types.js";
import { chunkEntries, chunkToTranscript, type CaptionChunk } from "./chunker.js";
import { hashChunk, hashPrompt } from "./hasher.js";
import { buildMapPayload, buildReducePayload, speakerOf } from "./payload.js";

export type AnalyzeOptions = {
  userPrompt?: string;
  title?: string;
  includePrevious?: boolean;
};

export type AnalyzeResult = {
  summary: StoredSummary;
  fromCache: { map: number; total: number };
  previousIncluded: boolean;
};

function abortError(): DOMException {
  return new DOMException("Analysis aborted", "AbortError");
}

async function mapChunk(
  sessionId: string,
  chunk: CaptionChunk,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  title: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ hash: string; summary: string; cached: boolean }> {
  const hash = await hashChunk(chunk);
  const existing = await findChunkByHash(sessionId, hash);
  if (existing) return { hash, summary: existing.summary, cached: true };

  const summary = await generateAnalysis(settings, buildMapPayload(chunk, settings, { title }), signal);
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
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  const rawEntries = await getSessionEntries(sessionId);
  const entries: CaptionEntry[] = rawEntries.map(({ sessionId: _ignored, ...rest }) => rest);
  if (!entries.length) throw new Error("No captions to analyse");

  const chunks = chunkEntries(entries);
  const settings = await loadSettings();
  const speaker = speakerOf(settings);
  const transcriptChars = chunks.map((chunk) => chunkToTranscript(chunk, speaker).length);
  const charsTotal = transcriptChars.reduce((sum, n) => sum + n, 0);
  const runId = crypto.randomUUID();

  await patchProgress(sessionId, {
    runId,
    phase: "mapping",
    totalChunks: chunks.length,
    completedChunks: 0,
    cachedChunks: 0,
    currentChunk: 0,
    charsSent: 0,
    charsTotal,
    error: undefined,
  });

  try {
    const userPrompt = options.userPrompt?.trim() ?? "";
    const title = options.title?.trim() || undefined;
    const previous = options.includePrevious ? await latestSummary(sessionId) : null;

    let cachedHits = 0;
    let charsSent = 0;
    const mapped: Array<{ hash: string; summary: string }> = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw abortError();
      await patchProgress(sessionId, { currentChunk: i + 1 });
      const result = await mapChunk(sessionId, chunks[i], settings, title, signal);
      if (result.cached) cachedHits += 1;
      else charsSent += transcriptChars[i];
      mapped.push({ hash: result.hash, summary: result.summary });
      await patchProgress(sessionId, {
        completedChunks: i + 1,
        cachedChunks: cachedHits,
        charsSent,
      });
    }

    if (signal?.aborted) throw abortError();
    await patchProgress(sessionId, { phase: "reducing" });

    const promptHash = await hashPrompt({
      chunkHashes: mapped.map((m) => m.hash),
      userPrompt: `${title ?? ""}::${userPrompt}::${previous?.id ?? ""}`,
    });

    const content = await generateAnalysis(
      settings,
      buildReducePayload(
        mapped.map((m) => m.summary),
        userPrompt,
        settings,
        { title, previousSummary: previous?.content },
      ),
      signal,
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
    await patchProgress(sessionId, { phase: "done", currentChunk: chunks.length });

    return {
      summary,
      fromCache: { map: cachedHits, total: chunks.length },
      previousIncluded: !!previous,
    };
  } catch (error) {
    const aborted = signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
    await patchProgress(sessionId, {
      phase: aborted ? "aborted" : "error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
