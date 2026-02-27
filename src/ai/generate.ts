import { generateText, stepCountIs } from "ai";
import { buildSystemPrompt } from "./prompt.js";
import { resolveModel } from "./llm.js";
import { validateSpec, dryRunSpec } from "./validate.js";
import { fetch_url, search_registry, test_extraction, submit_spec } from "./tools.js";
import type { ValidationResult, DryRunResult } from "./validate.js";
import type { ResolutionSpec } from "../types.js";

export interface GenerateOptions {
  dryRun?: boolean;
  verbose?: boolean;
  maxSteps?: number;
  model?: string;
}

export interface GenerateResult {
  spec: ResolutionSpec;
  validation: ValidationResult;
  dryRunResult?: DryRunResult;
  steps: number;
}

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

  const tools = { fetch_url, search_registry, test_extraction, submit_spec };

  const { steps } = await generateText({
    model,
    system: systemPrompt,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    onStepFinish: ({ toolCalls, text }) => {
      if (verbose && toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          stderr(`  Tool call: ${tc.toolName}`, true);
        }
      }
      if (verbose && text) {
        stderr(`  LLM text: ${text.slice(0, 200)}`, true);
      }
    },
  });

  stderr(`Agent completed in ${steps.length} step(s)`, verbose);

  // Extract the submitted spec from the steps
  let submittedSpec: ResolutionSpec | undefined;
  let submittedValidation: ValidationResult | undefined;
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
      }
    }
  }

  if (!submittedSpec) {
    const errorDetail = lastErrors.length > 0
      ? `Last validation errors: ${lastErrors.join(", ")}`
      : "The agent did not call submit_spec";

    throw new Error(
      `Failed to generate valid spec after ${steps.length} steps. ${errorDetail}`
    );
  }

  const validation = submittedValidation!;

  // Optional belt-and-suspenders dry run
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
    spec: submittedSpec,
    validation,
    dryRunResult,
    steps: steps.length,
  };
}
