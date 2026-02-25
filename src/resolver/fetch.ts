import type { ResolutionSpec } from "../types.js";

/**
 * Resolve `$env:VAR_NAME` placeholders in header values from environment variables.
 * This keeps secrets out of committed spec files.
 */
function resolveHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const envMatch = value.match(/^\$env:(.+)$/);
    if (envMatch) {
      const envVar = envMatch[1];
      const envVal = process.env[envVar];
      if (!envVal) {
        throw new Error(`Environment variable "${envVar}" required by header "${key}" is not set`);
      }
      resolved[key] = envVal;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export async function fetchData(source: ResolutionSpec["source"]): Promise<string> {
  const url = new URL(source.url);

  if (source.query) {
    for (const [key, value] of Object.entries(source.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: source.method,
    headers: resolveHeaders(source.headers),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}
