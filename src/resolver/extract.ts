import { JSONPath } from "jsonpath-plus";
import { executeScript } from "./script-sandbox.js";
import type { ResolutionSpec } from "../types.js";

export function extractValue(rawResponse: string, extraction: ResolutionSpec["extraction"]): string {
  if (extraction.type === "script") {
    return executeScript(rawResponse, extraction.code);
  }

  // JSONPath extraction (existing behavior)
  const data = JSON.parse(rawResponse);
  const results = JSONPath({ path: extraction.path, json: data });

  if (!results || results.length === 0) {
    throw new Error(`JSONPath "${extraction.path}" returned no results`);
  }

  const value = results[0];
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
