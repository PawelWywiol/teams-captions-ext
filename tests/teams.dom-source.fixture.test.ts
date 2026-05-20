import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  DomCaptionSource,
  extractCaptionEntriesFromRoot,
  findCaptionsRoot,
} from "../src/content/dom-source.js";
import type { CaptionEntry } from "../src/shared/types.js";

function loadFixtureDocument(): Document {
  const html = readFileSync(resolve("tests/fixtures/teams-captions-sample.html"), "utf8");
  return new JSDOM(html).window.document;
}

function buildCaptionItemMarkup({
  speaker = "Solo Speaker",
  text = "Only caption line",
  withAuthor = true,
  useLegacyMessageClass = true,
  itemClass = useLegacyMessageClass
    ? "fui-ChatMessageCompact caption-item-01"
    : "teams-caption-item-01",
}: {
  speaker?: string;
  text?: string;
  withAuthor?: boolean;
  useLegacyMessageClass?: boolean;
  itemClass?: string;
} = {}): string {
  const author = withAuthor
    ? `<span class="fui-ChatMessageCompact__author"><span data-tid="author">${speaker}</span></span>`
    : "";
  const avatarClass = useLegacyMessageClass
    ? "fui-ChatMessageCompact__avatar"
    : "teams-caption-avatar";
  const bodyClass = useLegacyMessageClass ? "fui-ChatMessageCompact__body" : "teams-caption-body";

  return `
    <div class="${itemClass}">
      <div class="${avatarClass}">
        <div class="teams-avatar" data-tid="closed-captions-v2-items-renderer"></div>
      </div>
      <div class="${bodyClass}">
        ${author}
        <span class="fui-StyledText" data-tid="closed-caption-text">${text}</span>
      </div>
    </div>
  `;
}

function buildSingleCaptionDocument(withAuthor = true, useLegacyMessageClass = true): Document {
  const html = `
    <div class="fui-Primitive">
      <div class="fui-Flex teams-captions-list">
        <div class="fui-Flex row-01">
          <div class="fui-Flex inner-01">
            ${buildCaptionItemMarkup({ withAuthor, useLegacyMessageClass })}
          </div>
        </div>
      </div>
    </div>
  `;

  return new JSDOM(html).window.document;
}

describe("teams DOM caption extraction", () => {
  it("finds the Teams captions root in the fixture", () => {
    const document = loadFixtureDocument();
    const root = findCaptionsRoot(document);

    expect(root).not.toBeNull();
  });

  it("extracts caption entries from the fixture root", () => {
    const document = loadFixtureDocument();
    const root = findCaptionsRoot(document);

    expect(root).not.toBeNull();

    const entries = extractCaptionEntriesFromRoot(root as HTMLElement);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]?.text.length).toBeGreaterThan(0);
    expect(entries.some((entry: CaptionEntry) => entry.speakerOriginal?.length)).toBe(true);
  });

  it("extracts the expected number of caption entries from the sample", () => {
    const document = loadFixtureDocument();
    const root = findCaptionsRoot(document);
    const entries = extractCaptionEntriesFromRoot(root as HTMLElement);

    expect(entries).toHaveLength(25);
  });

  it("keeps working when there is only one caption item", () => {
    const document = buildSingleCaptionDocument();
    const root = findCaptionsRoot(document);

    expect(root).not.toBeNull();
    expect(extractCaptionEntriesFromRoot(root as HTMLElement)).toHaveLength(1);
  });

  it("extracts captions without relying on legacy Teams message classes", () => {
    const document = buildSingleCaptionDocument(true, false);
    const root = findCaptionsRoot(document);
    const entries = extractCaptionEntriesFromRoot(root as HTMLElement);

    expect(root).not.toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      speakerOriginal: "Solo Speaker",
      text: "Only caption line",
    });
  });

  it("extracts caption text even when author node is missing", () => {
    const document = buildSingleCaptionDocument(false);
    const root = findCaptionsRoot(document);

    expect(root).not.toBeNull();

    const entries = extractCaptionEntriesFromRoot(root as HTMLElement);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      speakerOriginal: undefined,
      text: "Only caption line",
    });
  });

  it("does not extract captions from a broad wrapper that also contains unrelated text", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="fui-Flex teams-captions-list">
          <div class="broad-wrapper">
            <div class="non-caption-panel">
              <span>Unrelated confidential note</span>
            </div>
            <div class="fui-Flex row-01">
              <div class="fui-Flex inner-01">
                ${buildCaptionItemMarkup({ useLegacyMessageClass: false })}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const broadWrapper = document.querySelector(".broad-wrapper") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(broadWrapper)).toEqual([]);

    const root = findCaptionsRoot(document);
    const entries = extractCaptionEntriesFromRoot(root as HTMLElement);

    expect(root).not.toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      speakerOriginal: "Solo Speaker",
      text: "Only caption line",
    });
  });

  it("fails closed when the nearest shared ancestor also contains unrelated branches", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="fui-Flex teams-captions-list">
          <div class="caption-shell">
            <div class="teams-caption-item-outer">
              <div class="teams-caption-avatar">
                <div data-tid="closed-captions-v2-items-renderer"></div>
              </div>
              <div class="teams-caption-body">
                <span data-tid="author">Boundary Speaker</span>
                <span data-tid="closed-caption-text">Boundary caption</span>
              </div>
            </div>
            <aside class="sidebar-leak">Sidebar draft that must never be captured</aside>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const shell = document.querySelector(".caption-shell") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(shell)).toEqual([]);
  });

  it("fails closed when nested non-caption text appears inside the candidate item subtree", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="fui-Flex teams-captions-list">
          <div class="teams-caption-item-outer">
            <div class="teams-caption-avatar">
              <div data-tid="closed-captions-v2-items-renderer"></div>
            </div>
            <div class="teams-caption-body">
              <span data-tid="author">Nested Speaker</span>
              <div class="body-stack">
                <span data-tid="closed-caption-text">Nested caption</span>
                <div class="nested-leak">
                  <span>Draft sidebar text that must never be captured</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const root = document.querySelector(".teams-captions-list") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(root)).toEqual([]);
  });

  it("fails closed for legacy-class wrappers that also contain unrelated branches", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="fui-Flex teams-captions-list">
          <div class="fui-ChatMessageCompact broad-legacy-wrapper">
            <div class="fui-ChatMessageCompact__avatar">
              <div data-tid="closed-captions-v2-items-renderer"></div>
            </div>
            <div class="fui-ChatMessageCompact__body">
              <span data-tid="author">Legacy Speaker</span>
              <span data-tid="closed-caption-text">Legacy caption</span>
            </div>
            <aside class="legacy-leak">Legacy sidebar leak</aside>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const root = document.querySelector(".teams-captions-list") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(root)).toEqual([]);
  });

  it("stops ascent when a caption path crosses an invalid wrapper before a broader valid-looking ancestor", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="teams-captions-list">
          <div class="outer-shell">
            <div class="mixed-wrapper">
              <div class="caption-branch">
                <div class="teams-caption-avatar">
                  <div data-tid="closed-captions-v2-items-renderer"></div>
                </div>
                <div class="teams-caption-body">
                  <span data-tid="author">Blocked Speaker</span>
                  <span data-tid="closed-caption-text">Blocked caption</span>
                </div>
              </div>
              <div class="mixed-side-panel">
                <span>Confidential side text</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const root = document.querySelector(".teams-captions-list") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(root)).toEqual([]);
  });

  it("fails closed for the entire root when any caption path inside it is invalid", () => {
    const html = `
      <div class="fui-Primitive">
        <div class="teams-captions-list">
          <div class="valid-caption-item">
            <div class="teams-caption-avatar">
              <div data-tid="closed-captions-v2-items-renderer"></div>
            </div>
            <div class="teams-caption-body">
              <span data-tid="author">Valid Speaker</span>
              <span data-tid="closed-caption-text">Valid caption</span>
            </div>
          </div>
          <div class="invalid-caption-wrapper">
            <div class="caption-fragment">
              <div class="teams-caption-avatar">
                <div data-tid="closed-captions-v2-items-renderer"></div>
              </div>
              <div class="teams-caption-body">
                <span data-tid="author">Invalid Speaker</span>
                <span data-tid="closed-caption-text">Invalid caption</span>
              </div>
            </div>
            <aside class="invalid-extra">Leaky extra text</aside>
          </div>
        </div>
      </div>
    `;
    const document = new JSDOM(html).window.document;
    const root = document.querySelector(".teams-captions-list") as HTMLElement;

    expect(extractCaptionEntriesFromRoot(root)).toEqual([]);
  });

  it("does not treat a generic wrapper as a direct caption item when legacy class is absent", async () => {
    const document = buildSingleCaptionDocument(true, false);
    const observed: CaptionEntry[] = [];
    const source = new DomCaptionSource((entry) => {
      observed.push(entry);
    });

    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    globalThis.document = document;
    globalThis.MutationObserver = document.defaultView!.MutationObserver;
    globalThis.HTMLElement = document.defaultView!.HTMLElement;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: document.defaultView!.crypto,
    });

    try {
      expect(source.start()).toBe(true);

      const list = document.querySelector(".teams-captions-list") as HTMLElement;
      const wrapper = document.createElement("div");
      wrapper.className = "broad-wrapper-append";
      wrapper.innerHTML = `
        <div class="non-caption-panel">
          <span>Unrelated confidential note</span>
        </div>
        <div class="fui-Flex inner-02">
          ${buildCaptionItemMarkup({
            speaker: "Second Speaker",
            text: "Second caption line",
            useLegacyMessageClass: false,
            itemClass: "teams-caption-item-02",
          })}
        </div>
      `;

      list.appendChild(wrapper);
      await Promise.resolve();

      expect(observed).toHaveLength(1);
      expect(observed[0]).toMatchObject({
        speakerOriginal: "Second Speaker",
        text: "Second caption line",
      });
    } finally {
      source.stop();
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      globalThis.HTMLElement = previousHTMLElement;
      if (previousCryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", previousCryptoDescriptor);
      }
    }
  });

  it("observes each caption item when one appended wrapper contains multiple captions", async () => {
    const document = buildSingleCaptionDocument(true, false);
    const observed: CaptionEntry[] = [];
    const source = new DomCaptionSource((entry) => {
      observed.push(entry);
    });

    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    globalThis.document = document;
    globalThis.MutationObserver = document.defaultView!.MutationObserver;
    globalThis.HTMLElement = document.defaultView!.HTMLElement;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: document.defaultView!.crypto,
    });

    try {
      expect(source.start()).toBe(true);

      const list = document.querySelector(".teams-captions-list") as HTMLElement;
      const wrapper = document.createElement("div");
      wrapper.className = "fui-Flex row-batch";
      wrapper.innerHTML = `
        <div class="fui-Flex inner-batch">
          ${buildCaptionItemMarkup({
            speaker: "Second Speaker",
            text: "Second caption line",
            useLegacyMessageClass: false,
            itemClass: "teams-caption-item-02",
          })}
          ${buildCaptionItemMarkup({
            speaker: "Third Speaker",
            text: "Third caption line",
            useLegacyMessageClass: false,
            itemClass: "teams-caption-item-03",
          })}
        </div>
      `;

      list.appendChild(wrapper);
      await Promise.resolve();

      expect(observed).toHaveLength(2);
      expect(observed).toMatchObject([
        {
          speakerOriginal: "Second Speaker",
          text: "Second caption line",
        },
        {
          speakerOriginal: "Third Speaker",
          text: "Third caption line",
        },
      ]);
    } finally {
      source.stop();
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      globalThis.HTMLElement = previousHTMLElement;
      if (previousCryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", previousCryptoDescriptor);
      }
    }
  });

  it("observes new sibling captions after starting from a single caption item", async () => {
    const document = buildSingleCaptionDocument();
    const observed: CaptionEntry[] = [];
    const source = new DomCaptionSource((entry) => {
      observed.push(entry);
    });

    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    globalThis.document = document;
    globalThis.MutationObserver = document.defaultView!.MutationObserver;
    globalThis.HTMLElement = document.defaultView!.HTMLElement;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: document.defaultView!.crypto,
    });

    try {
      expect(source.start()).toBe(true);

      const list = document.querySelector(".teams-captions-list") as HTMLElement;
      const sibling = document.createElement("div");
      sibling.className = "fui-Flex row-02";
      sibling.innerHTML = `
        <div class="fui-Flex inner-02">
          ${buildCaptionItemMarkup({
            speaker: "Second Speaker",
            text: "Second caption line",
          })}
        </div>
      `;

      list.appendChild(sibling);
      await Promise.resolve();

      expect(observed).toHaveLength(1);
      expect(observed[0]).toMatchObject({
        speakerOriginal: "Second Speaker",
        text: "Second caption line",
      });
    } finally {
      source.stop();
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      globalThis.HTMLElement = previousHTMLElement;
      if (previousCryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", previousCryptoDescriptor);
      }
    }
  });
});
