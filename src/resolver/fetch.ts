import type { ResolutionSpec } from "../types.js";
import { log } from "./log.js";

/**
 * Resolve `$env:VAR_NAME` placeholders in header values from environment variables.
 * This keeps secrets out of committed spec files.
 */
export function resolveHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
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

async function fetchData(source: Extract<ResolutionSpec["source"], { type: "http" }>): Promise<string> {
  const url = new URL(source.url);

  if (source.query) {
    for (const [key, value] of Object.entries(source.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const resolvedHdrs = resolveHeaders(source.headers);
  log.request(url.toString(), source.method, resolvedHdrs, source.headers);

  const response = await fetch(url.toString(), {
    method: source.method,
    headers: resolvedHdrs,
  });

  const body = await response.text();
  log.response(response.status, body.length, body);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return body;
}

export async function fetchBrowser(source: { url: string; waitFor?: string }): Promise<string> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(source.url, { waitUntil: "networkidle2", timeout: 30000 });

    if (source.waitFor) {
      await page.waitForSelector(source.waitFor, { timeout: 15000 });
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function fetchSource(source: ResolutionSpec["source"]): Promise<string> {
  if (source.type === "browser") {
    return fetchBrowser(source);
  }
  return fetchData(source);
}
