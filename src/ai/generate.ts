import { generateText, stepCountIs } from "ai";
import { buildSystemPrompt } from "./prompt.js";
import { resolveModel } from "./llm.js";
import { validateSpec, dryRunSpec } from "./validate.js";
import { expandTemplate } from "./template.js";
import { fetch_url, search_registry, test_extraction, submit_spec, submit_template } from "./tools.js";
import type { ValidationResult, DryRunResult } from "./validate.js";
import type { ResolutionSpec, TemplateSpec } from "../types.js";

export interface GenerateOptions {
  dryRun?: boolean;
  verbose?: boolean;
  maxSteps?: number;
  model?: string;
}

export type GenerateResult =
  | {
      type: "single";
      spec: ResolutionSpec;
      validation: ValidationResult;
      dryRunResult?: DryRunResult;
      steps: number;
    }
  | {
      type: "template";
      template: TemplateSpec;
      specs: ResolutionSpec[];
      dryRunResult?: DryRunResult;
      steps: number;
    };

function stderr(msg: string, verbose: boolean) {
  if (verbose) {
    console.error(msg);
  }
}

export async function generateSpec(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { dryRun = false, verbose = false, maxSteps = 15, model: modelFlag } = options;

  const systemPrompt = buildSystemPrompt();
  const { providerName, modelId, model } = await resolveModel(modelFlag);
  console.error(`Using model: ${providerName}/${modelId}`);

  const tools = { fetch_url, search_registry, test_extraction, submit_spec, submit_template };

  const { steps } = await generateText({
    model,
    system: systemPrompt,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    onStepFinish: ({ toolCalls, toolResults, text }) => {
      if (verbose && text) {
        stderr(`\n--- LLM Response ---\n${text}\n`, true);
      }
      if (verbose && toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const argsJson = JSON.stringify((tc as Record<string, unknown>).args, null, 2);
          stderr(`\n>>> Tool call: ${tc.toolName}\n${argsJson}`, true);
        }
      }
      if (verbose && toolResults && toolResults.length > 0) {
        for (const tr of toolResults) {
          const resultJson = JSON.stringify(tr.output, null, 2);
          const truncated = resultJson.length > 3000
            ? resultJson.slice(0, 3000) + "\n  ... (truncated)"
            : resultJson;
          stderr(`\n<<< Tool result: ${tr.toolName}\n${truncated}`, true);
        }
      }
    },
  });

  stderr(`Agent completed in ${steps.length} step(s)`, verbose);

  // Extract submitted spec or template from steps
  let submittedSpec: ResolutionSpec | undefined;
  let submittedValidation: ValidationResult | undefined;
  let submittedTemplate: TemplateSpec | undefined;
  let lastErrors: string[] = [];

  for (const step of steps) {
    if (!step.toolResults) continue;
    for (const result of step.toolResults) {
      if (result.toolName === "submit_spec") {
        const output = result.output as Record<string, unknown>;
        if (output.success && output.spec) {
          submittedSpec = output.spec as ResolutionSpec;
          submittedValidation = validateSpec(submittedSpec);
        } else if (!output.success && output.errors) {
          lastErrors = output.errors as string[];
        }
      } else if (result.toolName === "submit_template") {
        const output = result.output as Record<string, unknown>;
        if (output.success && output.template) {
          submittedTemplate = output.template as TemplateSpec;
        } else if (!output.success && output.errors) {
          lastErrors = output.errors as string[];
        }
      }
    }
  }

  // Template path
  if (submittedTemplate) {
    const specs = expandTemplate(submittedTemplate);
    stderr(`Template expanded to ${specs.length} spec(s)`, verbose);

    let dryRunResult: DryRunResult | undefined;
    if (dryRun && specs.length > 0) {
      stderr("Running final dry-run validation on first variant...", verbose);
      dryRunResult = await dryRunSpec(specs[0]);
      if (dryRunResult.success) {
        stderr(
          `Dry-run success: extracted=${dryRunResult.extractedValue}, transformed=${dryRunResult.transformedValue}, result=${dryRunResult.ruleResult}`,
          verbose
        );
      } else {
        stderr(`Dry-run failed: ${dryRunResult.error}`, verbose);
      }
    }

    return {
      type: "template",
      template: submittedTemplate,
      specs,
      dryRunResult,
      steps: steps.length,
    };
  }

  // Single spec path
  if (!submittedSpec) {
    const errorDetail = lastErrors.length > 0
      ? `Last validation errors: ${lastErrors.join(", ")}`
      : "The agent did not call submit_spec or submit_template";

    throw new Error(
      `Failed to generate valid spec after ${steps.length} steps. ${errorDetail}`
    );
  }

  const validation = submittedValidation!;

  let dryRunResult: DryRunResult | undefined;
  if (dryRun) {
    stderr("Running final dry-run validation...", verbose);
    dryRunResult = await dryRunSpec(submittedSpec);
    if (dryRunResult.success) {
      stderr(
        `Dry-run success: extracted=${dryRunResult.extractedValue}, transformed=${dryRunResult.transformedValue}, result=${dryRunResult.ruleResult}`,
        verbose
      );
    } else {
      stderr(`Dry-run failed: ${dryRunResult.error}`, verbose);
    }
  }

  return {
    type: "single",
    spec: submittedSpec,
    validation,
    dryRunResult,
    steps: steps.length,
  };
}
