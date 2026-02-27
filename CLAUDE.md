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
```

No JS test framework (Jest/Vitest) is configured. Solidity tests use Foundry.

## Architecture

```
src/
  ai/         Agentic spec generation (LLM + tools: fetch_url, search_registry, test_extraction, submit_spec)
  resolver/   Deterministic engine: fetch → extract → transform → evaluate → sign
  registry/   Curated data source descriptors (JSON files in sources/)
  cli/        CLI entry points (all use process.argv, output JSON to stdout, logs to stderr)
  lib/        viem contract helpers
  types.ts    Core interfaces: ResolutionSpec, SignedPayload
contracts/    Solidity (VoranOracle) + Foundry tests
specs/        Example and generated resolution specs
```

**Resolution flow**: `resolve()` in `src/resolver/index.ts` orchestrates the pipeline. `fetchSource()` dispatches to HTTP fetch or Puppeteer browser. `extractValue()` runs JSONPath or sandboxed JS (`script-sandbox.ts` uses Node VM with restricted globals, 5s timeout). `transformValue()` and `evaluateRule()` are pure functions. `hashAndSign()` produces keccak256 hashes + EIP-191 signature via viem.

**Spec generation flow**: `generateSpec()` in `src/ai/generate.ts` runs a Vercel AI SDK agentic loop. LLM provider is auto-detected from env vars or specified with `--model provider/model`. The agent iterates with tools until it calls `submit_spec`, which validates the spec against real data.

**Registry**: JSON descriptors in `src/registry/sources/` define API endpoints, example responses, common JSONPaths, and applicable transforms. The AI agent searches these first before trying custom URLs.

## Conventions

- ES modules only (`"type": "module"` in package.json). All imports use `.js` extensions.
- Hex strings typed as `` `0x${string}` `` (viem pattern).
- LLM provider SDKs are lazy-imported (`await import("@ai-sdk/...")`).
- Secrets in specs use `$env:VAR_NAME` syntax in header values, resolved at runtime by `resolveHeaders()`.
- Logger (`resolver/log.ts`) writes structured audit trail to stderr, masks sensitive headers.
- Browser source specs (`source.type: "browser"`) launch headless Chromium via Puppeteer; a screenshot is saved to `{VORAN_SCREENSHOT_DIR || os.tmpdir()}/voran-browser-screenshot.png`.
- Script extraction contract: `function extract(rawResponse: string): string` — must return a string.
- CLI pattern: args from `process.argv`, JSON result to stdout, diagnostics to stderr, `process.exit(1)` on error.
