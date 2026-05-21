import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const safariInstallDoc = readFileSync(resolve(repoRoot, "docs/install-safari.md"), "utf8");

describe("manual test readiness", () => {
  it("exposes scripts for mock proxy and packaging", () => {
    expect(packageJson.scripts?.["dev:mock-proxy"]).toBe("node ./scripts/mock-llm-proxy.mjs");
    expect(packageJson.scripts?.["package:chromium"]).toBe("node ./scripts/package-chromium.mjs");
    expect(packageJson.scripts?.["package:safari"]).toBe("node ./scripts/package-safari.mjs");
  });

  it("README points users to GitHub Releases for both browsers", () => {
    expect(readme).toContain("teams-captions-ext-chromium-<TAG>.zip");
    expect(readme).toContain("teams-captions-ext-safari-unsigned-<TAG>.zip");
    expect(readme).toContain("docs/install-safari.md");
    expect(readme).toContain("cli-llm-proxy");
  });

  it("Safari install guide covers unsigned extension workflow", () => {
    expect(safariInstallDoc).toContain("Allow Unsigned Extensions");
    expect(safariInstallDoc).toContain("Teams Captions.app");
    expect(safariInstallDoc).toContain("teams.microsoft.com");
  });

  it("release workflow and packaging scripts are present", () => {
    expect(existsSync(resolve(repoRoot, ".github/workflows/release.yml"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "scripts/package-safari.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "scripts/package-chromium.mjs"))).toBe(true);
  });
});
