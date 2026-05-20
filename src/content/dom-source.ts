import type { CaptionEntry } from "../shared/types.js";

type OnEntry = (entry: CaptionEntry) => void;

const CAPTION_MARKER_SELECTOR = '[data-tid="closed-captions-v2-items-renderer"]';
const CAPTION_AUTHOR_SELECTOR = '[data-tid="author"]';
const CAPTION_TEXT_SELECTOR = '[data-tid="closed-caption-text"]';
const CHAT_MESSAGE_CLASS = "fui-ChatMessageCompact";

function hasClassToken(element: Element, token: string): boolean {
  return element.classList.contains(token);
}

function findMessageContainer(element: Element | null): HTMLElement | null {
  let current = element;

  while (current) {
    if ("classList" in current && hasClassToken(current, CHAT_MESSAGE_CLASS)) {
      return current as HTMLElement;
    }

    current = current.parentElement;
  }

  return null;
}

function findCaptionMarkers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(CAPTION_MARKER_SELECTOR)) as HTMLElement[];
}

function toCaptionEntry(element: HTMLElement): CaptionEntry | null {
  const speakerOriginal =
    element.querySelector(CAPTION_AUTHOR_SELECTOR)?.textContent?.trim() || undefined;
  const text = element.querySelector(CAPTION_TEXT_SELECTOR)?.textContent?.trim();

  if (!text) return null;

  const entry: CaptionEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    speakerOriginal,
    text,
    source: "dom",
  };

  return entry;
}

export function findCaptionsRoot(root: ParentNode = document): HTMLElement | null {
  const firstMarker = findCaptionMarkers(root)[0];

  if (!firstMarker) return null;

  const firstMessage = findMessageContainer(firstMarker);
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
  const textNodes = Array.from(root.querySelectorAll<HTMLElement>(CAPTION_TEXT_SELECTOR));
  const seen = new Set<HTMLElement>();
  const entries: CaptionEntry[] = [];

  for (const textNode of textNodes) {
    const container = findMessageContainer(textNode);
    if (!container || seen.has(container)) continue;

    seen.add(container);

    const entry = toCaptionEntry(container);
    if (entry) entries.push(entry);
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

  private parseNode(node: HTMLElement): CaptionEntry | null {
    const candidate =
      findMessageContainer(node) ?? findMessageContainer(node.querySelector(CAPTION_TEXT_SELECTOR));

    if (!candidate) return null;

    const parsed = toCaptionEntry(candidate);
    if (!parsed) return null;

    const fingerprint = `${parsed.speakerOriginal ?? ""}::${parsed.text}`;
    if (this.hasRecentFingerprint(fingerprint)) return null;

    this.rememberFingerprint(fingerprint);
    return parsed;
  }

  start(): boolean {
    const root = findCaptionsRoot();
    if (!root) return false;
    const observationRoot = findObservationRoot(root);

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const parsed = this.parseNode(node);
          if (parsed) this.onEntry(parsed);
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
