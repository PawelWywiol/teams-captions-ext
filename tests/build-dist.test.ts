import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repoRoot, "dist");

function runBuild(): void {
  execFileSync("pnpm", ["build"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
}

describe("build output", () => {
  it("produces compiled source without emitting tests into dist", { timeout: 30000 }, () => {
    rmSync(distRoot, { force: true, recursive: true });

    runBuild();

    expect(existsSync(resolve(distRoot, "src/background/index.js"))).toBe(true);
    expect(existsSync(resolve(distRoot, "tests"))).toBe(false);
  });
});
