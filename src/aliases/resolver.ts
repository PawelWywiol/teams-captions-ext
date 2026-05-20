export function resolveSpeakerName(
  original: string | undefined,
  aliases: Record<string, string>,
): string | undefined {
  if (!original) return undefined;
  return aliases[original] || original;
}
