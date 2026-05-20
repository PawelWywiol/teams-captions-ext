import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const repoRoot = resolve(import.meta.dirname, "..");
const outdir = resolve(repoRoot, "dist/extension");
const srcDir = resolve(repoRoot, "src");

async function main() {
  rmSync(outdir, { force: true, recursive: true });
  mkdirSync(outdir, { recursive: true });
  mkdirSync(resolve(outdir, "background"), { recursive: true });
  mkdirSync(resolve(outdir, "content"), { recursive: true });
  mkdirSync(resolve(outdir, "options"), { recursive: true });
  mkdirSync(resolve(outdir, "popup"), { recursive: true });

  await build({
    bundle: true,
    entryPoints: {
      "background/index": resolve(srcDir, "background/index.ts"),
      "content/index": resolve(srcDir, "content/index.ts"),
      "options/index": resolve(srcDir, "options/index.ts"),
      "popup/index": resolve(srcDir, "popup/index.ts"),
    },
    format: "esm",
    legalComments: "none",
    outbase: srcDir,
    outdir,
    platform: "browser",
    sourcemap: false,
    target: ["safari16", "chrome120"],
  });

  const manifest = JSON.parse(readFileSync(resolve(srcDir, "manifest.json"), "utf8"));
  writeFileSync(resolve(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  cpSync(resolve(srcDir, "options/index.html"), resolve(outdir, "options/index.html"));
  cpSync(resolve(srcDir, "popup/index.html"), resolve(outdir, "popup/index.html"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
