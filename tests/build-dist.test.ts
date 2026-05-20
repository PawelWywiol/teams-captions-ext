import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repoRoot, "dist");

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

function runBuild(): void {
  execFileSync("npx", ["--yes", "pnpm@9.0.0", "build"], {
    cwd: repoRoot,
    env: buildEnv(),
    stdio: "pipe",
  });
}

describe("build output", () => {
  it("produces compiled source without emitting tests into dist", () => {
    rmSync(distRoot, { force: true, recursive: true });

    runBuild();

    expect(existsSync(resolve(distRoot, "src/background/index.js"))).toBe(true);
    expect(existsSync(resolve(distRoot, "tests"))).toBe(false);
  });
});
