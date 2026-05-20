import type { CaptionEntry } from "../shared/types.js";

type OnEntry = (entry: CaptionEntry) => void;

export class DomCaptionSource {
  private observer: MutationObserver | null = null;
  private recentFingerprints: string[] = [];

  constructor(private readonly onEntry: OnEntry) {}

  findCaptionsRoot(): HTMLElement | null {
    return document.querySelector('[data-tid="closed-captions-v2-items-renderer"]');
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

  private parseNode(node: HTMLElement): CaptionEntry | null {
    const speakerNode = node.querySelector('[data-tid="author"]');
    const textNode = node.querySelector('[data-tid="closed-caption-text"]');

    if (!textNode) return null;

    const text = textNode.textContent?.trim();
    const speakerOriginal = speakerNode?.textContent?.trim() || undefined;

    if (!text) return null;

    const fingerprint = `${speakerOriginal ?? ""}::${text}`;
    if (this.hasRecentFingerprint(fingerprint)) return null;

    this.rememberFingerprint(fingerprint);

    return {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      speakerOriginal,
      text,
      source: "dom",
    };
  }

  start(): boolean {
    const root = this.findCaptionsRoot();
    if (!root) return false;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const parsed = this.parseNode(node);
          if (parsed) this.onEntry(parsed);
        }
      }
    });

    this.observer.observe(root, {
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
