import type { CaptionEntry } from "../shared/types.js";
import {
  CAPTION_AUTHOR_SELECTOR,
  CAPTION_LIST_SELECTOR,
  CAPTION_MARKER_SELECTOR,
  CAPTION_TEXT_SELECTOR,
  findCaptionMarkers,
  findCaptionTextNodes,
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

    if (hasUnexpectedReadableText(current)) {
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

    if (hasUnexpectedReadableText(current)) {
      return null;
    }

    current = current.parentElement;
  }

  return null;
}

type CaptionIdentity = { id: string; ts: string; speaker?: string };

function toCaptionEntry(element: HTMLElement, identity?: CaptionIdentity): CaptionEntry | null {
  const speakerOriginal =
    element.querySelector(CAPTION_AUTHOR_SELECTOR)?.textContent?.trim() || undefined;
  const text = element.querySelector(CAPTION_TEXT_SELECTOR)?.textContent?.trim();

  if (!text) return null;

  return {
    id: identity?.id ?? crypto.randomUUID(),
    ts: identity?.ts ?? new Date().toISOString(),
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
  if (hasUnexpectedReadableText(root)) {
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

export type CaptionSourceStats = {
  rootFound: boolean;
  observerActive: boolean;
  markersCount: number;
  textNodesCount: number;
};

export class DomCaptionSource {
  private observer: MutationObserver | null = null;
  private recentFingerprints: string[] = [];
  private rootRef: HTMLElement | null = null;
  private identities = new WeakMap<HTMLElement, CaptionIdentity>();

  constructor(private readonly onEntry: OnEntry) {}

  getStats(): CaptionSourceStats {
    const scope: ParentNode = this.rootRef ?? document;
    return {
      rootFound: !!this.rootRef,
      observerActive: !!this.observer,
      markersCount: scope.querySelectorAll(CAPTION_MARKER_SELECTOR).length,
      textNodesCount: scope.querySelectorAll(CAPTION_TEXT_SELECTOR).length,
    };
  }

  // Capture is unhealthy once the root detaches (Teams re-rendered the captions
  // subtree); the tick uses this to re-attach instead of staying orphaned.
  isHealthy(): boolean {
    return !!this.observer && !!this.rootRef && this.rootRef.isConnected;
  }

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

    const fingerprint = `${entry.id}::${entry.speakerOriginal ?? ""}::${entry.text}`;
    if (this.hasRecentFingerprint(fingerprint)) return null;

    this.rememberFingerprint(fingerprint);
    return entry;
  }

  // Teams mutates the last caption element's text in place while a person is
  // speaking; a stable identity per element lets the background upsert one row
  // per utterance instead of appending every intermediate version. A speaker
  // change on the same element means the virtual list recycled it for a new
  // utterance, so the identity is re-minted.
  private identityFor(container: HTMLElement): CaptionIdentity {
    const speaker =
      container.querySelector(CAPTION_AUTHOR_SELECTOR)?.textContent?.trim() || undefined;
    const existing = this.identities.get(container);
    if (existing && existing.speaker === speaker) return existing;

    const identity: CaptionIdentity = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      speaker,
    };
    this.identities.set(container, identity);
    return identity;
  }

  private parseNode(node: HTMLElement): CaptionEntry[] {
    const entries: CaptionEntry[] = [];
    const textNodes = node.matches(CAPTION_TEXT_SELECTOR)
      ? [node]
      : Array.from(node.querySelectorAll<HTMLElement>(CAPTION_TEXT_SELECTOR));

    for (const textNode of textNodes) {
      const container = findContainerByTextNode(textNode);
      if (!container) continue;

      const entry = this.emitIfFresh(toCaptionEntry(container, this.identityFor(container)));
      if (entry) entries.push(entry);
    }

    return entries;
  }

  start(): boolean {
    const root = findCaptionsRoot();
    if (!root) {
      this.rootRef = null;
      return false;
    }
    // Observe the whole captions list, not a single item: Teams appends each new
    // caption as a sibling, so a per-item root would miss everything after the
    // first. Fall back to the heuristic ancestor when the list tid is absent.
    const observationRoot =
      root.closest<HTMLElement>(CAPTION_LIST_SELECTOR) ?? findObservationRoot(root);
    this.rootRef = observationRoot;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const host = mutation.target.parentElement;
          if (host) {
            for (const entry of this.parseNode(host)) {
              this.onEntry(entry);
            }
          }
          continue;
        }

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
      characterData: true,
    });

    // Capture captions already present when the observer attaches (e.g. CC was
    // enabled before start). Dedup stops the observer from re-emitting them.
    for (const entry of this.parseNode(observationRoot)) {
      this.onEntry(entry);
    }

    return true;
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.rootRef = null;
  }
}
