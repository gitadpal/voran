import { JSONPath } from "jsonpath-plus";
import { fetchSource } from "../resolver/fetch.js";
import { extractValue } from "../resolver/extract.js";
import { transformValue } from "../resolver/transform.js";
import { evaluateRule } from "../resolver/evaluate.js";
import { loadRegistry } from "../registry/index.js";
import type { ResolutionSpec } from "../types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_TRANSFORM_TYPES = ["decimal", "score_diff", "score_sum"] as const;
const VALID_RULE_TYPES = ["greater_than", "less_than", "equals"] as const;

export function validateSpec(spec: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["Spec must be a non-null object"], warnings };
  }

  const s = spec as Record<string, unknown>;

  // marketId
  if (typeof s.marketId !== "string" || s.marketId.length === 0) {
    errors.push("marketId must be a non-empty string");
  }

  // source
  if (!s.source || typeof s.source !== "object") {
    errors.push("source must be an object");
  } else {
    const src = s.source as Record<string, unknown>;

    if (src.type === "http") {
      if (src.method !== "GET" && src.method !== "POST") {
        errors.push('source.method must be "GET" or "POST"');
      }

      if (typeof src.url !== "string" || src.url.length === 0) {
        errors.push("source.url must be a non-empty string");
      } else {
        try {
          const parsed = new URL(src.url);
          if (parsed.protocol === "http:") {
            warnings.push("source.url uses HTTP instead of HTTPS — consider using HTTPS");
          }
        } catch {
          errors.push(`source.url is not a valid URL: ${src.url}`);
        }
      }

      if (src.query !== undefined) {
        if (typeof src.query !== "object" || src.query === null) {
          errors.push("source.query must be an object if provided");
        }
      }

      if (src.headers !== undefined) {
        if (typeof src.headers !== "object" || src.headers === null) {
          errors.push("source.headers must be an object if provided");
        } else {
          const headers = src.headers as Record<string, unknown>;
          for (const [key, value] of Object.entries(headers)) {
            if (typeof value !== "string") {
              errors.push(`source.headers["${key}"] must be a string`);
            } else if (value.startsWith("$env:")) {
              const envVar = value.slice(5);
              const registry = loadRegistry();
              const matchingSource = registry.find(
                (ds) => ds.api.auth?.envVar === envVar
              );
              if (!matchingSource) {
                warnings.push(
                  `Header "${key}" references $env:${envVar} which is not in any registry source's auth config`
                );
              }
            }
          }
        }
      }
    } else if (src.type === "browser") {
      if (typeof src.url !== "string" || src.url.length === 0) {
        errors.push("source.url must be a non-empty string");
      } else {
        try {
          const parsed = new URL(src.url);
          if (parsed.protocol === "http:") {
            warnings.push("source.url uses HTTP instead of HTTPS — consider using HTTPS");
          }
        } catch {
          errors.push(`source.url is not a valid URL: ${src.url}`);
        }
      }

      if (src.waitFor !== undefined) {
        if (typeof src.waitFor !== "string" || src.waitFor.length === 0) {
          errors.push("source.waitFor must be a non-empty string if provided");
        }
      }
    } else {
      errors.push('source.type must be "http" or "browser"');
    }
  }

  // extraction
  if (!s.extraction || typeof s.extraction !== "object") {
    errors.push("extraction must be an object");
  } else {
    const ext = s.extraction as Record<string, unknown>;

    if (ext.type === "jsonpath") {
      if (typeof ext.path !== "string" || ext.path.length === 0) {
        errors.push("extraction.path must be a non-empty string");
      } else {
        // Validate JSONPath syntax by trying to compile it
        try {
          JSONPath({ path: ext.path, json: {}, resultType: "path" });
        } catch (e) {
          errors.push(
            `extraction.path has invalid JSONPath syntax: ${(e as Error).message}`
          );
        }
      }
    } else if (ext.type === "script") {
      if (ext.lang !== "javascript") {
        errors.push('extraction.lang must be "javascript"');
      }

      if (typeof ext.code !== "string" || ext.code.length === 0) {
        errors.push("extraction.code must be a non-empty string");
      } else {
        const code = ext.code as string;

        // Check that it defines an extract function
        if (!/\bfunction\s+extract\b|\bconst\s+extract\b|\blet\s+extract\b|\bvar\s+extract\b/.test(code)) {
          errors.push("extraction.code must define an extract() function");
        }

        // Syntax check
        try {
          new Function(code);
        } catch (e) {
          errors.push(`extraction.code has syntax error: ${(e as Error).message}`);
        }

        // Warn about forbidden globals
        if (/\brequire\s*\(/.test(code)) {
          warnings.push("extraction.code contains require() — this will fail in the sandbox");
        }
        if (/\bimport\s+/.test(code)) {
          warnings.push("extraction.code contains import — this will fail in the sandbox");
        }
        if (/\bfetch\s*\(/.test(code)) {
          warnings.push("extraction.code contains fetch() — this will fail in the sandbox");
        }
        if (/\bprocess\./.test(code)) {
          warnings.push("extraction.code references process — this will fail in the sandbox");
        }
      }
    } else {
      errors.push('extraction.type must be "jsonpath" or "script"');
    }
  }

  // transform
  if (!s.transform || typeof s.transform !== "object") {
    errors.push("transform must be an object");
  } else {
    const tf = s.transform as Record<string, unknown>;
    if (!VALID_TRANSFORM_TYPES.includes(tf.type as typeof VALID_TRANSFORM_TYPES[number])) {
      errors.push(
        `transform.type must be one of: ${VALID_TRANSFORM_TYPES.join(", ")}. Got: ${tf.type}`
      );
    }
  }

  // rule
  if (!s.rule || typeof s.rule !== "object") {
    errors.push("rule must be an object");
  } else {
    const r = s.rule as Record<string, unknown>;
    if (!VALID_RULE_TYPES.includes(r.type as typeof VALID_RULE_TYPES[number])) {
      errors.push(
        `rule.type must be one of: ${VALID_RULE_TYPES.join(", ")}. Got: ${r.type}`
      );
    }

    if (typeof r.value !== "number" || !Number.isFinite(r.value)) {
      errors.push("rule.value must be a finite number");
    }
  }

  // Heuristic: transform/extraction compatibility (only for JSONPath — can't statically analyze scripts)
  if (s.transform && s.extraction) {
    const ext = s.extraction as Record<string, unknown>;
    const tf = (s.transform as Record<string, unknown>).type;
    if (ext.type === "jsonpath" && (tf === "score_diff" || tf === "score_sum")) {
      const path = ext.path as string;
      if (path && (path.endsWith(".home") || path.endsWith(".away"))) {
        warnings.push(
          `Transform "${tf}" expects a score object {home, away}, but extraction path ends with a single score field`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface DryRunResult {
  success: boolean;
  rawResponse?: string;
  extractedValue?: string;
  transformedValue?: string;
  ruleResult?: boolean;
  error?: string;
}

export async function dryRunSpec(spec: ResolutionSpec): Promise<DryRunResult> {
  try {
    const rawResponse = await fetchSource(spec.source);
    const extractedValue = extractValue(rawResponse, spec.extraction);
    const transformedValue = transformValue(extractedValue, spec.transform);
    const ruleResult = evaluateRule(transformedValue, spec.rule);

    return {
      success: true,
      rawResponse: rawResponse.length > 2000 ? rawResponse.slice(0, 2000) + "..." : rawResponse,
      extractedValue,
      transformedValue,
      ruleResult,
    };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }
}
