import { validateSpec, dryRunSpec } from "./validate.js";
import type { DryRunResult, ValidationResult } from "./validate.js";
import type { ResolutionSpec, TemplateSpec } from "../types.js";

/**
 * Deep-substitute {param} placeholders in any value.
 * Strings: replace all {name} occurrences.
 * Numbers/booleans: pass through.
 * Arrays/objects: recurse.
 */
function substituteParams(
  obj: unknown,
  replacements: Record<string, string | number>
): unknown {
  if (typeof obj === "string") {
    let result = obj;
    for (const [name, value] of Object.entries(replacements)) {
      result = result.replaceAll(`{${name}}`, String(value));
    }
    return result;
  }
  if (typeof obj === "number" || typeof obj === "boolean" || obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => substituteParams(item, replacements));
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      out[key] = substituteParams(value, replacements);
    }
    return out;
  }
  return obj;
}

/**
 * Parse a substituted query value: if it looks numeric, return a number.
 */
function parseQueryValues(
  query: Record<string, string | number>
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function expandTemplate(template: TemplateSpec): ResolutionSpec[] {
  const { params } = template;
  if (params.length === 0) return [];

  const count = params[0].values.length;
  for (const param of params) {
    if (param.values.length !== count) {
      throw new Error(
        `All params must have the same number of values. "${param.name}" has ${param.values.length}, expected ${count}.`
      );
    }
  }

  const specs: ResolutionSpec[] = [];

  for (let i = 0; i < count; i++) {
    const replacements: Record<string, string | number> = {};
    for (const param of params) {
      replacements[param.name] = param.values[i];
    }

    const marketId = substituteParams(template.marketIdTemplate, replacements) as string;
    const source = substituteParams(template.source, replacements) as ResolutionSpec["source"];
    const extraction = substituteParams(template.extraction, replacements) as ResolutionSpec["extraction"];
    const transform = template.transform; // no placeholders in transform type

    // rule.value: if string, substitute and parse to number; if number, use as-is
    let ruleValue: number;
    if (typeof template.rule.value === "string") {
      const substituted = substituteParams(template.rule.value, replacements) as string;
      ruleValue = parseFloat(substituted);
      if (isNaN(ruleValue)) {
        throw new Error(
          `rule.value "${template.rule.value}" substituted to "${substituted}" which is not a number (row ${i})`
        );
      }
    } else {
      ruleValue = template.rule.value;
    }

    // Parse numeric query values after substitution
    if (source.type === "http" && source.query) {
      source.query = parseQueryValues(source.query as Record<string, string | number>);
    }

    const spec: ResolutionSpec = {
      marketId,
      source,
      extraction,
      transform,
      rule: { type: template.rule.type, value: ruleValue },
    };

    if (template.timestampRule) {
      spec.timestampRule = substituteParams(template.timestampRule, replacements) as ResolutionSpec["timestampRule"];
    }

    specs.push(spec);
  }

  return specs;
}

export interface ExpandResult {
  specs: ResolutionSpec[];
  validations: Map<string, ValidationResult>;
  dryRunResult?: DryRunResult;
}

export async function expandAndValidate(
  template: TemplateSpec,
  options: { dryRun?: boolean } = {}
): Promise<ExpandResult> {
  const specs = expandTemplate(template);
  const validations = new Map<string, ValidationResult>();

  for (const spec of specs) {
    validations.set(spec.marketId, validateSpec(spec));
  }

  let dryRunResult: DryRunResult | undefined;
  if (options.dryRun && specs.length > 0) {
    dryRunResult = await dryRunSpec(specs[0]);
  }

  return { specs, validations, dryRunResult };
}
