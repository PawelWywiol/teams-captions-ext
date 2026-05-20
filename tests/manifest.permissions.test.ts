import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../src/manifest.json"), "utf8"),
) as {
  host_permissions: string[];
  optional_host_permissions?: string[];
};

describe("manifest host permissions", () => {
  it("keeps Teams origins as static host_permissions and moves proxy access to optional_host_permissions", () => {
    expect(manifest.host_permissions).toEqual([
      "https://teams.microsoft.com/*",
      "https://*.teams.microsoft.com/*",
    ]);

    expect(manifest.optional_host_permissions).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://10.*/*",
      "http://192.168.*/*",
      "http://172.16.*/*",
      "http://172.17.*/*",
      "http://172.18.*/*",
      "http://172.19.*/*",
      "http://172.20.*/*",
      "http://172.21.*/*",
      "http://172.22.*/*",
      "http://172.23.*/*",
      "http://172.24.*/*",
      "http://172.25.*/*",
      "http://172.26.*/*",
      "http://172.27.*/*",
      "http://172.28.*/*",
      "http://172.29.*/*",
      "http://172.30.*/*",
      "http://172.31.*/*",
      "https://*/*",
    ]);
  });
});
