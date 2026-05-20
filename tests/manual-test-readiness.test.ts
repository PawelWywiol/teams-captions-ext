import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

describe("manual test readiness", () => {
  it("exposes a dedicated mock-proxy script for local manual testing", () => {
    expect(packageJson.scripts?.["dev:mock-proxy"]).toBe("node ./scripts/mock-llm-proxy.mjs");
  });

  it("documents a concrete manual test flow using build:extension and the local mock proxy", () => {
    expect(readme).toContain("## Manual test");
    expect(readme).toContain("pnpm build:extension");
    expect(readme).toContain("pnpm dev:mock-proxy");
    expect(readme).toContain("Load `dist/extension/`");
    expect(readme).toContain("http://127.0.0.1:8787");
    expect(readme).toContain("curl http://127.0.0.1:8787/health");
    expect(readme).toContain("Chromium browser for now");
    expect(readme).toContain("Safari conversion/packaging is still a follow-up step");
  });
});
