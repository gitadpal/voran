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

**CI/CD pipeline**: Two-stage verify-then-merge pipeline. See "GitHub Actions Workflows" section below for details.

## GitHub Actions Workflows

### `generate-spec.yml` — AI Spec Generation

Triggered manually via `workflow_dispatch` (Actions tab or `gh workflow run`). Takes a natural language prompt and produces a PR with one or more spec files.

**Inputs:**
- `prompt` (required) — Natural language market description (e.g. "Will BTC exceed $120k by March 2026?")
- `title` (optional) — Short run title for the Actions UI. Defaults to the full prompt if empty.
- `model` (optional) — LLM provider/model (e.g. `doubao/doubao-seed-2-0-pro-260215`, `openai/gpt-4o`). Auto-detects from available API keys if empty.
- `max_steps` (optional, default `15`) — Maximum agent tool-calling steps.

**Trigger via CLI:**
```bash
gh workflow run generate-spec.yml \
  -f prompt="Will Arsenal win next match against Chelsea?" \
  -f title="Arsenal vs Chelsea" \
  -f model="doubao/doubao-seed-2-0-pro-260215"
```

**What it does:**
1. Runs `generate-spec.ts` with `--dry-run --verbose --output-dir /tmp/specs`
2. The AI agent researches data sources, tests extraction, and submits a validated spec
3. Creates a PR on a `spec/{marketId}` branch (single spec) or `spec/batch-{timestamp}` branch (template batch)
4. Uses `PAT_TOKEN` secret (not `GITHUB_TOKEN`) so the PR triggers the verify workflow

**Required secrets:** `PAT_TOKEN`, plus at least one LLM API key (`ARK_API_KEY`, `DEEPSEEK_API_KEY`, etc.), plus data source keys as needed (`FOOTBALL_DATA_API_KEY`).

**Timeout:** 7 minutes for the generation step.

### `verify-spec.yml` — Spec Verification & Auto-merge

Triggered automatically on PRs that modify `specs/*.json`. Runs the full deterministic resolver on each changed spec file.

**What it does:**
1. Finds changed spec files in the PR via `gh pr diff`
2. Runs `run-resolver.ts` on each spec file
3. On success: auto-merges the PR with squash and deletes the branch
4. On failure: posts a comment with a link to the failing workflow logs for manual review

**Required secrets:** `RESOLVER_PRIVATE_KEY`, `FOOTBALL_DATA_API_KEY` (and any other data source API keys used by specs).

**When it doesn't trigger:** If the PR was created with `GITHUB_TOKEN` instead of `PAT_TOKEN`, GitHub won't fire the `pull_request` event. This is why `generate-spec.yml` uses `PAT_TOKEN`.

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
