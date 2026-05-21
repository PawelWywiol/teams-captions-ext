#!/usr/bin/env node
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform } from "node:os";

const repoRoot = resolve(import.meta.dirname, "..");
const extensionDir = resolve(repoRoot, "dist/extension");
const safariDir = resolve(repoRoot, "dist/safari");
const derivedDir = resolve(repoRoot, "dist/safari-derived");
const outputZip = resolve(repoRoot, "dist/teams-captions-ext-safari-unsigned.zip");

const BUNDLE_ID = process.env.SAFARI_BUNDLE_ID ?? "com.pawelwywiol.teamscaptions";
const APP_NAME = process.env.SAFARI_APP_NAME ?? "Teams Captions";

function run(cmd, args, options = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...options });
}

function ensureMacos() {
  if (platform() !== "darwin") {
    throw new Error("Safari packaging requires macOS with Xcode tooling.");
  }
}

function ensureExtensionBuilt() {
  if (!existsSync(join(extensionDir, "manifest.json"))) {
    throw new Error(`Run 'pnpm build:extension' first — missing ${extensionDir}`);
  }
}

function convert() {
  rmSync(safariDir, { force: true, recursive: true });
  mkdirSync(safariDir, { recursive: true });
  run("xcrun", [
    "safari-web-extension-converter",
    extensionDir,
    "--project-location",
    safariDir,
    "--bundle-identifier",
    BUNDLE_ID,
    "--app-name",
    APP_NAME,
    "--no-open",
    "--force",
    "--swift",
    "--no-prompt",
  ]);
}

function locateProject() {
  const entries = readdirSync(safariDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const inner = join(safariDir, e.name);
    const candidates = readdirSync(inner).filter((n) => n.endsWith(".xcodeproj"));
    if (candidates[0]) return { project: join(inner, candidates[0]), root: inner };
  }
  throw new Error("Generated .xcodeproj not found");
}

function listScheme(projectPath) {
  const output = execSync(`xcodebuild -list -project "${projectPath}" -json`, {
    encoding: "utf8",
  });
  const data = JSON.parse(output);
  const scheme = data.project?.schemes?.[0];
  if (!scheme) throw new Error("No scheme detected in generated project");
  return scheme;
}

function xcodeBuild(projectPath, scheme) {
  rmSync(derivedDir, { force: true, recursive: true });
  run("xcodebuild", [
    "-project",
    projectPath,
    "-scheme",
    scheme,
    "-configuration",
    "Release",
    "-derivedDataPath",
    derivedDir,
    "CODE_SIGN_IDENTITY=",
    "CODE_SIGNING_REQUIRED=NO",
    "CODE_SIGNING_ALLOWED=NO",
    "build",
  ]);
}

function locateBuiltApp() {
  const productsRoot = join(derivedDir, "Build/Products/Release");
  if (!existsSync(productsRoot)) throw new Error(`Missing build output at ${productsRoot}`);
  const candidates = readdirSync(productsRoot).filter((n) => n.endsWith(".app"));
  if (!candidates[0]) throw new Error("Built .app not found");
  return join(productsRoot, candidates[0]);
}

function zipApp(appPath) {
  rmSync(outputZip, { force: true });
  const productsRoot = appPath.substring(0, appPath.lastIndexOf("/"));
  const appName = appPath.substring(appPath.lastIndexOf("/") + 1);
  run("ditto", ["-c", "-k", "--keepParent", join(productsRoot, appName), outputZip]);
  const size = (statSync(outputZip).size / 1024 / 1024).toFixed(2);
  console.log(`Created ${outputZip} (${size} MB)`);
}

function main() {
  ensureMacos();
  ensureExtensionBuilt();
  convert();
  const { project } = locateProject();
  const scheme = listScheme(project);
  xcodeBuild(project, scheme);
  const app = locateBuiltApp();
  zipApp(app);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
