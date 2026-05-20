import type { CaptionEntry } from "../shared/types.js";
import {
  CAPTION_AUTHOR_SELECTOR,
  CAPTION_MARKER_SELECTOR,
  CAPTION_TEXT_SELECTOR,
  findCaptionMarkers,
  findCaptionTextNodes,
  hasBlockingSiblingBranches,
  hasUnexpectedReadableText,
  isValidCaptionBoundary,
} from "./selectors.js";

type OnEntry = (entry: CaptionEntry) => void;
const INVALID_CAPTION_PATH = Symbol("invalid-caption-path");

function resolveCaptionBoundary(
  textNode: Element | null,
): HTMLElement | typeof INVALID_CAPTION_PATH | null {
  let current = textNode;

  while (current) {
    if (isValidCaptionBoundary(current)) {
      return current as HTMLElement;
    }

    if (hasBlockingSiblingBranches(current) || hasUnexpectedReadableText(current)) {
      return INVALID_CAPTION_PATH;
    }

    current = current.parentElement;
  }

  return null;
}

function findContainerByTextNode(textNode: Element | null): HTMLElement | null {
  const resolved = resolveCaptionBoundary(textNode);
  return resolved instanceof HTMLElement ? resolved : null;
}

function findContainerByMarker(marker: Element | null): HTMLElement | null {
  let current = marker;

  while (current) {
    if (isValidCaptionBoundary(current)) {
      return current as HTMLElement;
    }

    if (hasBlockingSiblingBranches(current) || hasUnexpectedReadableText(current)) {
      return null;
    }

    current = current.parentElement;
  }

  return null;
}

function toCaptionEntry(element: HTMLElement): CaptionEntry | null {
  const speakerOriginal =
    element.querySelector(CAPTION_AUTHOR_SELECTOR)?.textContent?.trim() || undefined;
  const text = element.querySelector(CAPTION_TEXT_SELECTOR)?.textContent?.trim();

  if (!text) return null;

  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    speakerOriginal,
    text,
    source: "dom",
  };
}

export function findCaptionsRoot(root: ParentNode = document): HTMLElement | null {
  const firstMarker = findCaptionMarkers(root)[0];

  if (!firstMarker) return null;

  const firstMessage = findContainerByMarker(firstMarker);
  if (!firstMessage) return firstMarker;

  let current: HTMLElement = firstMessage;
  let currentMarkerCount = current.querySelectorAll(CAPTION_MARKER_SELECTOR).length;

  while (current.parentElement) {
    const parent = current.parentElement as HTMLElement;
    const markerCount = parent.querySelectorAll(CAPTION_MARKER_SELECTOR).length;

    if (markerCount > currentMarkerCount) {
      return parent;
    }

    current = parent;
    currentMarkerCount = markerCount;
  }

  return firstMessage;
}

function findObservationRoot(root: HTMLElement): HTMLElement {
  const rootMarkerCount = root.querySelectorAll(CAPTION_MARKER_SELECTOR).length;

  if (rootMarkerCount > 1) return root;

  let current = root;
  let depth = 0;

  while (current.parentElement && depth < 3) {
    const parent = current.parentElement as HTMLElement;
    const parentMarkerCount = parent.querySelectorAll(CAPTION_MARKER_SELECTOR).length;

    current = parent;
    depth += 1;

    if (parentMarkerCount > rootMarkerCount) {
      break;
    }
  }

  return current;
}

export function extractCaptionEntriesFromRoot(root: HTMLElement): CaptionEntry[] {
  if (hasBlockingSiblingBranches(root) || hasUnexpectedReadableText(root)) {
    return [];
  }

  const textNodes = findCaptionTextNodes(root);
  const seen = new Set<HTMLElement>();
  const entries: CaptionEntry[] = [];

  for (const textNode of textNodes) {
    const resolved = resolveCaptionBoundary(textNode);
    if (resolved === INVALID_CAPTION_PATH || resolved === null) {
      return [];
    }

    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const entry = toCaptionEntry(resolved);
    if (entry) {
      entries.push(entry);
      continue;
    }

    return [];
  }

  return entries;
}

export class DomCaptionSource {
  private observer: MutationObserver | null = null;
  private recentFingerprints: string[] = [];

  constructor(private readonly onEntry: OnEntry) {}

  private rememberFingerprint(fingerprint: string): void {
    this.recentFingerprints.push(fingerprint);
    if (this.recentFingerprints.length > 20) {
      this.recentFingerprints.shift();
    }
  }

  private hasRecentFingerprint(fingerprint: string): boolean {
    return this.recentFingerprints.includes(fingerprint);
  }

  private emitIfFresh(entry: CaptionEntry | null): CaptionEntry | null {
    if (!entry) return null;

    const fingerprint = `${entry.speakerOriginal ?? ""}::${entry.text}`;
    if (this.hasRecentFingerprint(fingerprint)) return null;

    this.rememberFingerprint(fingerprint);
    return entry;
  }

  private parseNode(node: HTMLElement): CaptionEntry[] {
    const entries: CaptionEntry[] = [];
    const textNodes = node.matches(CAPTION_TEXT_SELECTOR)
      ? [node]
      : Array.from(node.querySelectorAll<HTMLElement>(CAPTION_TEXT_SELECTOR));

    for (const textNode of textNodes) {
      const container = findContainerByTextNode(textNode);
      if (!container) continue;

      const entry = this.emitIfFresh(toCaptionEntry(container));
      if (entry) entries.push(entry);
    }

    return entries;
  }

  start(): boolean {
    const root = findCaptionsRoot();
    if (!root) return false;
    const observationRoot = findObservationRoot(root);

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          for (const entry of this.parseNode(node)) {
            this.onEntry(entry);
          }
        }
      }
    });

    this.observer.observe(observationRoot, {
      childList: true,
      subtree: true,
    });

    return true;
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
