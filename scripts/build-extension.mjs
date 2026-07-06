import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const repoRoot = resolve(import.meta.dirname, "..");
const outdir = resolve(repoRoot, "dist/extension");
const srcDir = resolve(repoRoot, "src");

async function main() {
  rmSync(outdir, { force: true, recursive: true });
  mkdirSync(outdir, { recursive: true });
  for (const sub of ["background", "content", "options", "popup", "sessions", "ui/shared"]) {
    mkdirSync(resolve(outdir, sub), { recursive: true });
  }

  const common = {
    bundle: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    legalComments: "none",
    outbase: srcDir,
    outdir,
    platform: "browser",
    sourcemap: false,
    target: ["safari16", "chrome120"],
  };

  await build({
    ...common,
    entryPoints: {
      "background/index": resolve(srcDir, "background/index.ts"),
      "options/index": resolve(srcDir, "options/index.tsx"),
      "popup/index": resolve(srcDir, "popup/index.tsx"),
      "sessions/index": resolve(srcDir, "sessions/index.tsx"),
    },
    format: "esm",
  });

  // Content script must be IIFE — it is injected via `new Function(code)()`
  // workaround for Safari MV3 bug where scripting.executeScript({files}) is a no-op.
  // ESM `export` syntax breaks Function() parsing.
  await build({
    ...common,
    entryPoints: {
      "content/index": resolve(srcDir, "content/index.ts"),
    },
    format: "iife",
  });

  const manifest = JSON.parse(readFileSync(resolve(srcDir, "manifest.json"), "utf8"));
  writeFileSync(resolve(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  cpSync(resolve(srcDir, "options/index.html"), resolve(outdir, "options/index.html"));
  cpSync(resolve(srcDir, "popup/index.html"), resolve(outdir, "popup/index.html"));
  cpSync(resolve(srcDir, "sessions/index.html"), resolve(outdir, "sessions/index.html"));
  cpSync(resolve(srcDir, "ui/shared/tokens.css"), resolve(outdir, "ui/shared/tokens.css"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
