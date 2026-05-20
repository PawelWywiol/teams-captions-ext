import { describe, expect, it } from "vitest";
import { validateSettings } from "../src/options/schema.js";
import type { PluginSettings } from "../src/shared/types.js";

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    apiBaseUrl: "http://127.0.0.1:8787",
    bearerToken: "test-token",
    provider: "copilot",
    customTitleDefault: "",
    extendedPromptDefault: "",
    participantAliases: {},
    ...overrides,
  };
}

describe("validateSettings", () => {
  it("accepts empty apiBaseUrl", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "" }))).toBeNull();
  });

  it("accepts valid loopback http url", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "http://127.0.0.1:8787" }))).toBeNull();
  });

  it("accepts localhost over http", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "http://localhost:8787" }))).toBeNull();
  });

  it("rejects http loopback addresses other than 127.0.0.1 because runtime host permissions are intentionally narrower", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "http://127.1.2.3:8787" }))).toBe(
      "HTTP is allowed only for localhost or 127.0.0.1",
    );
  });

  it("rejects .local over http because runtime host permissions are intentionally narrower", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "http://proxy.local:8787" }))).toBe(
      "HTTP is allowed only for localhost or 127.0.0.1",
    );
  });

  it("accepts private network https url", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "https://proxy.local" }))).toBeNull();
  });

  it("rejects invalid url", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "not-a-url" }))).toBe(
      "API Base URL is invalid",
    );
  });

  it("rejects non-http protocol", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "file:///tmp/x" }))).toBe(
      "API Base URL must use http/https",
    );
  });

  it("rejects public http url", () => {
    expect(validateSettings(makeSettings({ apiBaseUrl: "http://example.com" }))).toBe(
      "HTTP is allowed only for localhost or 127.0.0.1",
    );
  });
});
