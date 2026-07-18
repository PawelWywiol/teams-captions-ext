import { describe, expect, it, vi } from "vitest";
import { hasApiOriginPermission, requestApiOriginPermission } from "../src/api/permissions.js";

function makePermissions(overrides?: {
  contains?: (details: { origins: string[] }) => Promise<boolean>;
  request?: (details: { origins: string[] }) => Promise<boolean>;
}) {
  return {
    contains: vi.fn(overrides?.contains ?? (async () => false)),
    request: vi.fn(overrides?.request ?? (async () => true)),
  };
}

describe("hasApiOriginPermission", () => {
  it("returns true without checking when apiBaseUrl is empty", async () => {
    const permissions = makePermissions();

    await expect(hasApiOriginPermission("", permissions)).resolves.toBe(true);
    expect(permissions.contains).not.toHaveBeenCalled();
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("checks the port-less origin and never requests", async () => {
    const permissions = makePermissions({ contains: async () => true });

    await expect(
      hasApiOriginPermission("http://127.0.0.1:11434/base/path", permissions),
    ).resolves.toBe(true);

    expect(permissions.contains).toHaveBeenCalledWith({ origins: ["http://127.0.0.1/*"] });
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("returns false when the origin is not granted", async () => {
    const permissions = makePermissions({ contains: async () => false });

    await expect(hasApiOriginPermission("https://proxy.example.test", permissions)).resolves.toBe(
      false,
    );
  });
});

describe("requestApiOriginPermission", () => {
  it("returns true without prompting when apiBaseUrl is empty", async () => {
    const permissions = makePermissions();

    await expect(requestApiOriginPermission("", permissions)).resolves.toBe(true);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("requests the exact port-less origin and does not pre-check with contains", async () => {
    const permissions = makePermissions({ request: async () => true });

    await expect(
      requestApiOriginPermission("https://proxy.example.test:8443/base/path", permissions),
    ).resolves.toBe(true);

    expect(permissions.request).toHaveBeenCalledWith({ origins: ["https://proxy.example.test/*"] });
    expect(permissions.contains).not.toHaveBeenCalled();
  });

  it("returns false when the user denies the request", async () => {
    const permissions = makePermissions({ request: async () => false });

    await expect(requestApiOriginPermission("http://127.0.0.1:11434", permissions)).resolves.toBe(
      false,
    );
  });
});
