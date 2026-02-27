import { writeFileSync } from "fs";
import { createInterface } from "readline";
import { generateSpec } from "../ai/generate.js";

const args = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: npm run generate-spec -- "Will BTC exceed 120k by March 2026?"

  Generates a ResolutionSpec JSON from a natural language description using AI.
  The agent will research data sources, test extractions, and iterate until the spec works.

Options:
  --model <p/m>       Provider and model (e.g. "qwen/qwen-plus", "openai/gpt-4o")
  --dry-run           Fetch real data and verify extraction works after generation
  --output <path>     Write spec to file (otherwise prints to stdout)
  --verbose           Print debug info to stderr
  --interactive       Review spec before accepting
  --max-steps <n>     Maximum agent steps (default: 15)

Providers (auto-detected from env vars, or use --model):
  anthropic   ANTHROPIC_API_KEY              anthropic/claude-sonnet-4-20250514
  openai      OPENAI_API_KEY                 openai/gpt-4o
  google      GOOGLE_GENERATIVE_AI_API_KEY   google/gemini-2.0-flash
  deepseek    DEEPSEEK_API_KEY               deepseek/deepseek-chat
  qwen        DASHSCOPE_API_KEY              qwen/qwen-plus

Examples:
  npm run generate-spec -- "Will BTC exceed \$120,000?"
  npm run generate-spec -- "EUR/USD above 1.10" --model qwen/qwen-plus
  npm run generate-spec -- "Arsenal beats Chelsea matchday 29" --dry-run
  npm run generate-spec -- "gol.gg match result" --max-steps 20 --verbose`);
  process.exit(1);
}

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return "";
  return args[idx + 1];
}

// Extract prompt: first arg that isn't a flag or a flag's value
function extractPrompt(): string | undefined {
  const flagsWithValues = new Set(["--model", "--output", "--max-steps"]);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (flagsWithValues.has(args[i])) i++; // skip value
      continue;
    }
    return args[i];
  }
  return undefined;
}

const prompt = extractPrompt();
if (!prompt) usage();

const model = getArg("model") || undefined;
const dryRun = getFlag("dry-run");
const output = getArg("output");
const verbose = getFlag("verbose");
const interactive = getFlag("interactive");
const maxStepsArg = getArg("max-steps");
const maxSteps = maxStepsArg ? parseInt(maxStepsArg, 10) : undefined;

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.error(`Generating spec for: "${prompt}"`);

  const result = await generateSpec(prompt!, {
    dryRun,
    verbose,
    model,
    maxSteps,
  });

  const specJson = JSON.stringify(result.spec, null, 2);

  // Show warnings
  if (result.validation.warnings.length > 0) {
    console.error("\nWarnings:");
    for (const w of result.validation.warnings) {
      console.error(`  - ${w}`);
    }
  }

  // Show dry-run results
  if (result.dryRunResult) {
    console.error("\nDry-run results:");
    if (result.dryRunResult.success) {
      console.error(`  Extracted: ${result.dryRunResult.extractedValue}`);
      console.error(`  Transformed: ${result.dryRunResult.transformedValue}`);
      console.error(`  Rule result: ${result.dryRunResult.ruleResult}`);
    } else {
      console.error(`  FAILED: ${result.dryRunResult.error}`);
    }
  }

  console.error(`\nGenerated in ${result.steps} step(s)`);

  // Interactive mode
  if (interactive) {
    console.error("\nGenerated spec:");
    console.error(specJson);
    const answer = await promptUser("\nAccept this spec? (y/n): ");
    if (answer !== "y" && answer !== "yes") {
      console.error("Spec rejected.");
      process.exit(1);
    }
  }

  // Output
  if (output) {
    writeFileSync(output, specJson + "\n");
    console.error(`\nSpec written to: ${output}`);
  } else {
    console.log(specJson);
  }
}

main().catch((e) => {
  console.error(`\nError: ${(e as Error).message}`);
  process.exit(1);
});
