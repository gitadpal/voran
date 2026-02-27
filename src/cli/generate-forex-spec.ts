import { writeFileSync } from "fs";
import type { ResolutionSpec } from "../types.js";

const args = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: tsx src/cli/generate-forex-spec.ts \\
  --base EUR \\
  --quote USD \\
  --rule "greater_than:<rate>" | "less_than:<rate>" | "equals:<rate>" \\
  [--date 2026-02-26] \\
  [--output specs/my-forex-spec.json]

Data source: ECB reference rates via Frankfurter API (official ECB data, no API key).

Supported currencies: USD, GBP, JPY, CHF, AUD, CAD, CNY, HKD, SGD, and 30+ more.
Base currency is typically EUR (ECB publishes EUR-based rates).

Examples:
  # Will EUR/USD exceed 1.10?
  --base EUR --quote USD --rule greater_than:1.10

  # Will GBP/USD fall below 1.25 on a specific date?
  --base GBP --quote USD --rule less_than:1.25 --date 2026-03-01

  # Will EUR/JPY exceed 160?
  --base EUR --quote JPY --rule greater_than:160`);
  process.exit(1);
}

function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return "";
  return args[idx + 1];
}

const base = getArg("base").toUpperCase();
const quote = getArg("quote").toUpperCase();
const rule = getArg("rule");
const date = getArg("date");
const output = getArg("output");

if (!base || !quote || !rule) usage();

const ruleMatch = rule.match(/^(greater_than|less_than|equals):(.+)$/);
if (!ruleMatch) {
  console.error(`Invalid rule format: "${rule}". Expected: greater_than:<rate>, less_than:<rate>, or equals:<rate>`);
  process.exit(1);
}

const ruleType = ruleMatch[1] as ResolutionSpec["rule"]["type"];
const ruleValue = parseFloat(ruleMatch[2]);
if (isNaN(ruleValue)) {
  console.error(`Invalid rate value: "${ruleMatch[2]}"`);
  process.exit(1);
}

// Build the API URL
// If date is specified, use historical endpoint; otherwise use latest
const apiUrl = date
  ? `https://api.frankfurter.dev/v1/${date}`
  : "https://api.frankfurter.dev/v1/latest";

const dateLabel = date || "latest";
const marketId = `forex-${base.toLowerCase()}${quote.toLowerCase()}-${ruleType.replace("_", "")}-${ruleValue}-${dateLabel}`;

const spec: ResolutionSpec = {
  marketId,
  source: {
    type: "http",
    method: "GET",
    url: apiUrl,
    query: {
      base,
      symbols: quote,
    },
  },
  extraction: {
    type: "jsonpath",
    path: `$.rates.${quote}`,
  },
  transform: {
    type: "decimal",
  },
  rule: {
    type: ruleType,
    value: ruleValue,
  },
};

const outPath = output || `specs/${marketId}.json`;
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");

const symbols: Record<string, string> = { greater_than: ">", less_than: "<", equals: "=" };
console.log(`Spec written: ${outPath}`);
console.log(`  Market:   ${marketId}`);
console.log(`  Pair:     ${base}/${quote}`);
console.log(`  Rule:     ${base}/${quote} ${symbols[ruleType]} ${ruleValue}`);
console.log(`  Date:     ${dateLabel}`);
console.log(`  Source:   ECB reference rates (via Frankfurter API, no key required)`);
