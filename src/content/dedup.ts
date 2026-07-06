import type { CaptionEntry } from "../shared/types.js";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Same id + different text is NOT a duplicate: it is a progressive update of
// the same utterance and must be upserted over the existing row.
export function isDuplicate(
  existingEntries: CaptionEntry[],
  nextEntry: CaptionEntry,
  recentWindow = 5,
): boolean {
  const recent = existingEntries.slice(-recentWindow);

  return recent.some((entry) => {
    const sameText = normalize(entry.text) === normalize(nextEntry.text);

    if (entry.id === nextEntry.id) return sameText;

    return sameText && normalize(entry.speakerOriginal) === normalize(nextEntry.speakerOriginal);
  });
}
