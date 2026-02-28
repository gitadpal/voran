import { validateSpec, dryRunSpec } from "./validate.js";
import type { DryRunResult, ValidationResult } from "./validate.js";
import type { ResolutionSpec, TemplateSpec } from "../types.js";

export function expandTemplate(template: TemplateSpec): ResolutionSpec[] {
  const param = template.params[0];
  return param.values.map((value) => ({
    marketId: template.marketIdTemplate.replace(
      `{${param.name}}`,
      String(value)
    ),
    source: template.source,
    extraction: template.extraction,
    transform: template.transform,
    rule: { type: template.rule.type, value },
    ...(template.timestampRule ? { timestampRule: template.timestampRule } : {}),
  }));
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
