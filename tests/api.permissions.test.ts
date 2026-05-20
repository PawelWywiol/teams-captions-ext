import { describe, expect, it, vi } from "vitest";
import { ensureApiOriginPermission } from "../src/api/permissions.js";

function makePermissions(overrides?: {
  contains?: (details: { origins: string[] }) => Promise<boolean>;
  request?: (details: { origins: string[] }) => Promise<boolean>;
}) {
  return {
    contains: vi.fn(overrides?.contains ?? (async () => false)),
    request: vi.fn(overrides?.request ?? (async () => true)),
  };
}

describe("API origin permission helper", () => {
  it("does not request permission when apiBaseUrl is empty", async () => {
    const permissions = makePermissions();

    await expect(ensureApiOriginPermission("", permissions)).resolves.toBeUndefined();
    expect(permissions.contains).not.toHaveBeenCalled();
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("does not request permission when origin is already granted", async () => {
    const permissions = makePermissions({ contains: async () => true });

    await expect(
      ensureApiOriginPermission("https://proxy.example.test/v1", permissions),
    ).resolves.toBeUndefined();

    expect(permissions.contains).toHaveBeenCalledWith({
      origins: ["https://proxy.example.test/*"],
    });
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("requests exact origin permission without port when not already granted", async () => {
    const permissions = makePermissions({ contains: async () => false, request: async () => true });

    await expect(
      ensureApiOriginPermission("https://proxy.example.test:8443/base/path", permissions),
    ).resolves.toBeUndefined();

    expect(permissions.request).toHaveBeenCalledWith({
      origins: ["https://proxy.example.test/*"],
    });
  });

  it("fails closed when user denies runtime host permission request", async () => {
    const permissions = makePermissions({
      contains: async () => false,
      request: async () => false,
    });

    await expect(
      ensureApiOriginPermission("https://proxy.example.test/base/path", permissions),
    ).rejects.toThrow("Permission to access configured API origin was denied");
  });
});
