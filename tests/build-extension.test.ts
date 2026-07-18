import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const distExtension = resolve(repoRoot, "dist/extension");

function runBuildExtension(): void {
  execFileSync("pnpm", ["build:extension"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
}

describe("build:extension packaging", () => {
  it("produces a clean extension bundle under dist/extension", { timeout: 30000 }, () => {
    rmSync(distExtension, { force: true, recursive: true });

    runBuildExtension();

    expect(existsSync(resolve(distExtension, "manifest.json"))).toBe(true);
    expect(existsSync(resolve(distExtension, "background/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "content/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "options/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "options/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "popup/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "popup/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "sessions/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "sessions/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "prompts/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "prompts/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "ui/shared/tokens.css"))).toBe(true);
    expect(existsSync(resolve(distExtension, "tests"))).toBe(false);
    expect(existsSync(resolve(distExtension, "src"))).toBe(false);
  });
});
