import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
import { generateSpec, generateSpecChat } from "../ai/generate.js";
import { saveTemplate } from "../ai/template-library.js";

const args = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: npm run generate-spec -- "Will BTC exceed 120k by March 2026?"

  Generates a ResolutionSpec JSON from a natural language description using AI.
  The agent will research data sources, test extractions, and iterate until the spec works.

Options:
  --model <p/m>              Provider and model (e.g. "qwen/qwen-plus", "openai/gpt-4o")
  --dry-run                  Fetch real data and verify extraction works after generation
  --output <path>            Write single spec to file (otherwise prints to stdout)
  --output-dir <dir>         Write specs to directory (one file per spec, used for templates)
  --verbose                  Print debug info to stderr
  --interactive              Review spec before accepting
  --chat                     Interactive conversation mode — LLM asks clarifying questions
  --save-template <id>       Save successful template for future reuse
  --max-steps <n>            Maximum agent steps (default: 15)

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
  npm run generate-spec -- "AMZN close above {price} Mar 2, thresholds 200,210,220" --output-dir /tmp/specs`);
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
  const flagsWithValues = new Set(["--model", "--output", "--output-dir", "--max-steps", "--save-template"]);
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
const outputDir = getArg("output-dir");
const verbose = getFlag("verbose");
const interactive = getFlag("interactive");
const chat = getFlag("chat");
const saveTemplateId = getArg("save-template") || undefined;
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

  let result;
  if (chat) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    result = await generateSpecChat(prompt!, {
      dryRun,
      verbose,
      model,
      maxSteps,
      onAssistantMessage: (text) => {
        console.error(`\n${text}\n`);
      },
      getUserInput: () => {
        return new Promise<string>((res, rej) => {
          rl.question("> ", (answer) => {
            res(answer.trim());
          });
          rl.once("close", () => rej(new Error("Input stream closed.")));
        });
      },
    });
    rl.close();
  } else {
    result = await generateSpec(prompt!, {
      dryRun,
      verbose,
      model,
      maxSteps,
    });
  }

  if (result.type === "template") {
    console.error(`\nTemplate expanded to ${result.specs.length} spec(s)`);

    if (result.dryRunResult) {
      console.error("\nDry-run results (first variant):");
      if (result.dryRunResult.success) {
        console.error(`  Extracted: ${result.dryRunResult.extractedValue}`);
        console.error(`  Transformed: ${result.dryRunResult.transformedValue}`);
        console.error(`  Rule result: ${result.dryRunResult.ruleResult}`);
      } else {
        console.error(`  FAILED: ${result.dryRunResult.error}`);
      }
    }

    console.error(`\nGenerated in ${result.steps} step(s)`);

    if (interactive) {
      console.error("\nGenerated specs:");
      for (const spec of result.specs) {
        console.error(`  - ${spec.marketId} (rule: ${spec.rule.type} ${spec.rule.value})`);
      }
      const answer = await promptUser("\nAccept these specs? (y/n): ");
      if (answer !== "y" && answer !== "yes") {
        console.error("Specs rejected.");
        process.exit(1);
      }
    }

    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      for (const spec of result.specs) {
        const filePath = resolve(outputDir, `${spec.marketId}.json`);
        writeFileSync(filePath, JSON.stringify(spec, null, 2) + "\n");
        console.error(`  Written: ${filePath}`);
      }
    } else {
      // Print all specs as a JSON array to stdout
      console.log(JSON.stringify(result.specs, null, 2));
    }

    if (saveTemplateId) {
      saveTemplate({
        id: saveTemplateId,
        description: prompt!,
        keywords: saveTemplateId.split("-"),
        template: result.template,
        createdAt: new Date().toISOString(),
      });
      console.error(`Template saved as: ${saveTemplateId}`);
    }
  } else {
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
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      const filePath = resolve(outputDir, `${result.spec.marketId}.json`);
      writeFileSync(filePath, specJson + "\n");
      console.error(`  Written: ${filePath}`);
    } else if (output) {
      writeFileSync(output, specJson + "\n");
      console.error(`\nSpec written to: ${output}`);
    } else {
      console.log(specJson);
    }
  }
}

main().catch((e) => {
  console.error(`\nError: ${(e as Error).message}`);
  process.exit(1);
});
