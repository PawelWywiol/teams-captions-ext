import type { CaptionEntry } from "../shared/types.js";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDuplicate(
  existingEntries: CaptionEntry[],
  nextEntry: CaptionEntry,
  recentWindow = 5,
): boolean {
  const recent = existingEntries.slice(-recentWindow);

  return recent.some((entry) => {
    return (
      normalize(entry.speakerOriginal) === normalize(nextEntry.speakerOriginal) &&
      normalize(entry.text) === normalize(nextEntry.text)
    );
  });
}
