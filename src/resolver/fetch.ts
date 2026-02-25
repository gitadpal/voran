import type { ResolutionSpec } from "../types.js";

export async function fetchData(source: ResolutionSpec["source"]): Promise<string> {
  const url = new URL(source.url);

  if (source.query) {
    for (const [key, value] of Object.entries(source.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: source.method,
    headers: source.headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}
