import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { DomCaptionSource, extractCaptionEntriesFromRoot, findCaptionsRoot } from "../src/content/dom-source.js";
import type { CaptionEntry } from "../src/shared/types.js";

function loadFixtureDocument(): Document {
  const html = readFileSync(resolve("tests/fixtures/teams-captions-sample.html"), "utf8");
  return new JSDOM(html).window.document;
}

function buildSingleCaptionDocument(withAuthor = true): Document {
  const author = withAuthor ? '<span class="fui-ChatMessageCompact__author"><span data-tid="author">Solo Speaker</span></span>' : "";
  const html = `
    <div class="fui-Primitive">
      <div class="fui-Flex teams-captions-list">
        <div class="fui-Flex row-01">
          <div class="fui-Flex inner-01">
            <div class="fui-ChatMessageCompact caption-item-01">
              <div class="fui-ChatMessageCompact__avatar">
                <div class="teams-avatar" data-tid="closed-captions-v2-items-renderer"></div>
              </div>
              <div class="fui-ChatMessageCompact__body">
                ${author}
                <span class="fui-StyledText" data-tid="closed-caption-text">Only caption line</span>
              </div>
            </div>
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
          <div class="fui-ChatMessageCompact caption-item-02">
            <div class="fui-ChatMessageCompact__avatar">
              <div class="teams-avatar" data-tid="closed-captions-v2-items-renderer"></div>
            </div>
            <div class="fui-ChatMessageCompact__body">
              <span class="fui-ChatMessageCompact__author"><span data-tid="author">Second Speaker</span></span>
              <span class="fui-StyledText" data-tid="closed-caption-text">Second caption line</span>
            </div>
          </div>
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
