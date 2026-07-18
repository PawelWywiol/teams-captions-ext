export type RuntimePermissionsApi = {
  contains(details: { origins: string[] }): Promise<boolean>;
  request(details: { origins: string[] }): Promise<boolean>;
};

function toOriginPattern(apiBaseUrl: string): string | null {
  if (!apiBaseUrl) return null;

  const url = new URL(apiBaseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

function getPermissionsApi(): RuntimePermissionsApi {
  return browser.permissions;
}

// Check only. Safe to call from any context, including the background service
// worker (which has no user gesture and cannot call request()).
export async function hasApiOriginPermission(
  apiBaseUrl: string,
  permissionsApi: RuntimePermissionsApi = getPermissionsApi(),
): Promise<boolean> {
  const originPattern = toOriginPattern(apiBaseUrl);
  if (!originPattern) return true;

  return permissionsApi.contains({ origins: [originPattern] });
}

// Prompt for the host permission. MUST be called synchronously within a user
// gesture (e.g. an options-page button click): request() is the first await, so
// the gesture is still active. Resolves true if already granted or just granted.
export async function requestApiOriginPermission(
  apiBaseUrl: string,
  permissionsApi: RuntimePermissionsApi = getPermissionsApi(),
): Promise<boolean> {
  const originPattern = toOriginPattern(apiBaseUrl);
  if (!originPattern) return true;

  return permissionsApi.request({ origins: [originPattern] });
}
