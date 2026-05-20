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

export async function ensureApiOriginPermission(
  apiBaseUrl: string,
  permissionsApi: RuntimePermissionsApi = getPermissionsApi(),
): Promise<void> {
  const originPattern = toOriginPattern(apiBaseUrl);
  if (!originPattern) return;

  const origins = [originPattern];
  const alreadyGranted = await permissionsApi.contains({ origins });
  if (alreadyGranted) return;

  const granted = await permissionsApi.request({ origins });
  if (!granted) {
    throw new Error("Permission to access configured API origin was denied");
  }
}
