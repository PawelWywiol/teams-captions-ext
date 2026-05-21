#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const extensionDir = resolve(repoRoot, "dist/extension");
const outputZip = resolve(repoRoot, "dist/teams-captions-ext-chromium.zip");

if (!existsSync(extensionDir)) {
  console.error(`Run 'pnpm build:extension' first — missing ${extensionDir}`);
  process.exit(1);
}

rmSync(outputZip, { force: true });
execFileSync("zip", ["-r", "-q", outputZip, "."], {
  cwd: extensionDir,
  stdio: "inherit",
});

const sizeKB = (statSync(outputZip).size / 1024).toFixed(1);
console.log(`Created ${outputZip} (${sizeKB} KB)`);
