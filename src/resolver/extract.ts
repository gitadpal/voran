import { JSONPath } from "jsonpath-plus";
import type { ResolutionSpec } from "../types.js";

export function extractValue(rawResponse: string, extraction: ResolutionSpec["extraction"]): string {
  const data = JSON.parse(rawResponse);
  const results = JSONPath({ path: extraction.path, json: data });

  if (!results || results.length === 0) {
    throw new Error(`JSONPath "${extraction.path}" returned no results`);
  }

  return String(results[0]);
}
