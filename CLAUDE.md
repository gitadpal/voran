# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Voran is a two-layer deterministic oracle for on-chain settlement. **Layer A** (flexible): an AI agent generates structured `ResolutionSpec` JSON from natural language. **Layer B** (deterministic): a frozen resolver engine executes the spec with no AI at runtime — fetch, extract, transform, evaluate, sign.

## Commands

```bash
npm run build                    # TypeScript compilation (tsc)
npm run run-resolver -- <spec>   # Execute resolver on a spec file
npm run generate-spec -- "..."   # AI-driven spec generation from natural language
npm run e2e                      # Local end-to-end (requires Foundry + Anvil)
npx tsx src/cli/run-resolver.ts specs/example-btc.json   # Run a single spec directly
forge test --root contracts      # Run Solidity tests

# Template generation (batch specs from one AI run)
npx tsx src/cli/generate-spec.ts "AMZN close above {price} Mar 2? Thresholds 200,210,220" --output-dir /tmp/specs --dry-run

# Chat mode (interactive multi-turn conversation with LLM)
npx tsx src/cli/generate-spec.ts "EPL match winner" --chat --verbose

# Save a successful template for reuse
npx tsx src/cli/generate-spec.ts "EPL match winners: ..." --save-template epl-match-winner
```

No JS test framework (Jest/Vitest) is configured. Solidity tests use Foundry.

## Architecture

```
src/
  ai/         Agentic spec generation (LLM + tools: fetch_url, search_registry, search_templates, test_extraction, submit_spec, submit_template)
  ai/template.ts  Template expansion: expandTemplate(), expandAndValidate()
  ai/template-library.ts  Saved template library: loadTemplates(), searchTemplates(), saveTemplate()
  resolver/   Deterministic engine: fetch → extract → transform → evaluate → sign
  registry/   Curated data source descriptors (JSON files in sources/)
  cli/        CLI entry points (all use process.argv, output JSON to stdout, logs to stderr)
  lib/        viem contract helpers
  types.ts    Core interfaces: ResolutionSpec, TemplateSpec, SavedTemplate, SignedPayload
contracts/    Solidity (VoranOracle) + Foundry tests
specs/        Example and generated resolution specs
templates/    Saved template patterns (reusable by LLM via search_templates tool)
.github/workflows/
  generate-spec.yml   AI spec generation → PR (supports single + batch template)
  verify-spec.yml     Runs resolver on spec PRs → auto-merge on success, comment on failure
```

**Resolution flow**: `resolve()` in `src/resolver/index.ts` orchestrates the pipeline. `fetchSource()` dispatches to HTTP fetch or Puppeteer browser. `extractValue()` runs JSONPath or sandboxed JS (`script-sandbox.ts` uses Node VM with restricted globals, 5s timeout). `transformValue()` and `evaluateRule()` are pure functions. `hashAndSign()` produces keccak256 hashes + EIP-191 signature via viem.

**Spec generation flow**: `generateSpec()` in `src/ai/generate.ts` runs a Vercel AI SDK agentic loop. `generateSpecChat()` adds multi-turn conversation support (`--chat` flag). LLM provider is auto-detected from env vars or specified with `--model provider/model`. The agent iterates with tools until it calls `submit_spec` (single) or `submit_template` (batch). Returns a discriminated union: `{ type: "single", spec, ... } | { type: "template", template, specs, ... }`.

**Template generation**: When a prompt contains threshold lists or multiple fixtures, the agent calls `submit_template`. `expandTemplate()` in `src/ai/template.ts` stamps out variant specs with deep `{param}` substitution across all fields. Multiple params are paired by index (zipped, not cross-product). Only the first variant is dry-run tested.

**Template library**: Saved templates in `templates/` let the LLM reuse verified patterns. `search_templates` tool searches by keyword. The LLM finds a matching template, asks for param values (in chat mode), and submits with updated params — skipping source research. `--save-template <id>` persists a successful template.

**Registry**: JSON descriptors in `src/registry/sources/` define API endpoints, example responses, common JSONPaths, and applicable transforms. The AI agent searches these first before trying custom URLs.

**CI/CD pipeline**: `generate-spec.yml` creates a PR with spec(s). `verify-spec.yml` triggers on PR, runs the full resolver on each spec file, auto-merges on success or comments requesting review on failure. Uses `PAT_TOKEN` secret for PR creation to ensure verify workflow triggers.

## Conventions

- ES modules only (`"type": "module"` in package.json). All imports use `.js` extensions.
- Hex strings typed as `` `0x${string}` `` (viem pattern).
- LLM provider SDKs are lazy-imported (`await import("@ai-sdk/...")`).
- Secrets in specs use `$env:VAR_NAME` syntax in header values, resolved at runtime by `resolveHeaders()`.
- Logger (`resolver/log.ts`) writes structured audit trail to stderr, masks sensitive headers.
- Browser source specs (`source.type: "browser"`) launch headless Chromium via Puppeteer; a screenshot is saved to `{VORAN_SCREENSHOT_DIR || os.tmpdir()}/voran-browser-screenshot.png`.
- Script extraction contract: `function extract(rawResponse: string): string` — must return a string.
- CLI pattern: args from `process.argv`, JSON result to stdout, diagnostics to stderr, `process.exit(1)` on error.
- LLM providers: anthropic (ANTHROPIC_API_KEY), openai (OPENAI_API_KEY), google (GOOGLE_GENERATIVE_AI_API_KEY), deepseek (DEEPSEEK_API_KEY), qwen/dashscope (DASHSCOPE_API_KEY), doubao/volcengine (ARK_API_KEY). All use `@ai-sdk/openai-compatible` except Anthropic, OpenAI, and Google which have native SDKs.
- Template specs use `TemplateSpec` type with `marketIdTemplate` and `{param}` placeholders in any string field. `params` arrays are paired by index. `rule.value` can be static number or `"{param}"` string. Expanded to independent `ResolutionSpec` files.
- Saved templates (`SavedTemplate` in `templates/`) include id, description, keywords for LLM search.
