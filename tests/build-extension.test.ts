import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const distExtension = resolve(repoRoot, "dist/extension");

function buildEnv(): NodeJS.ProcessEnv {
  const pathEntries = [
    resolve(
      process.env.HOME ?? "/home/code",
      ".local/share/fnm/node-versions/v20.19.6/installation/bin",
    ),
    process.env.PATH ?? "",
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: pathEntries.join(":"),
  };
}

function runBuildExtension(): void {
  execFileSync("npx", ["--yes", "pnpm@9.0.0", "build:extension"], {
    cwd: repoRoot,
    env: buildEnv(),
    stdio: "pipe",
  });
}

describe("build:extension packaging", () => {
  it("produces a clean extension bundle under dist/extension", { timeout: 15000 }, () => {
    rmSync(distExtension, { force: true, recursive: true });

    runBuildExtension();

    expect(existsSync(resolve(distExtension, "manifest.json"))).toBe(true);
    expect(existsSync(resolve(distExtension, "background/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "content/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "options/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "options/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "popup/index.js"))).toBe(true);
    expect(existsSync(resolve(distExtension, "popup/index.html"))).toBe(true);
    expect(existsSync(resolve(distExtension, "tests"))).toBe(false);
    expect(existsSync(resolve(distExtension, "src"))).toBe(false);
  });
});
