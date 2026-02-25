import { writeFileSync } from "fs";
import type { ResolutionSpec } from "../types.js";

const args = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: tsx src/cli/generate-epl-spec.ts \\
  --home "Arsenal FC" \\
  --away "Chelsea FC" \\
  --matchday 29 \\
  --season 2024 \\
  --rule <rule> \\
  [--output specs/my-spec.json]

Rules:
  home_win              Home team wins (score_diff > 0)
  away_win              Away team wins (score_diff < 0)
  draw                  Match ends in draw (score_diff = 0)
  home_goals_gt:<n>     Home team scores more than n goals
  away_goals_gt:<n>     Away team scores more than n goals
  total_goals_gt:<n>    Total goals exceed n

Team names must match football-data.org exactly (e.g. "Arsenal FC", "Chelsea FC").

Examples:
  --home "Arsenal FC" --away "Chelsea FC" --matchday 29 --season 2024 --rule home_win
  --home "Arsenal FC" --away "Chelsea FC" --matchday 29 --season 2024 --rule total_goals_gt:2

API key is read from env var FOOTBALL_DATA_API_KEY at runtime (not stored in spec).
Set it locally in .env or as a GitHub secret.`);
  process.exit(1);
}

function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return "";
  return args[idx + 1];
}

const home = getArg("home");
const away = getArg("away");
const matchday = getArg("matchday");
const season = getArg("season");
const rule = getArg("rule");
const output = getArg("output");

if (!home || !away || !matchday || !season || !rule) usage();

// --- Build spec from rule ---
// football-data.org response: { matches: [{ homeTeam: { name }, awayTeam: { name }, score: { fullTime: { home, away } } }] }
// JSONPath filters the match by team names

const teamFilter = `$.matches[?(@.homeTeam.name=='${home}' && @.awayTeam.name=='${away}')]`;

interface ParsedRule {
  extraction: string;
  transform: ResolutionSpec["transform"]["type"];
  ruleType: ResolutionSpec["rule"]["type"];
  ruleValue: number;
  label: string;
}

function parseRule(r: string): ParsedRule {
  if (r === "home_win") {
    return {
      extraction: `${teamFilter}.score.fullTime`,
      transform: "score_diff",
      ruleType: "greater_than",
      ruleValue: 0,
      label: `${home} wins`,
    };
  }
  if (r === "away_win") {
    return {
      extraction: `${teamFilter}.score.fullTime`,
      transform: "score_diff",
      ruleType: "less_than",
      ruleValue: 0,
      label: `${away} wins`,
    };
  }
  if (r === "draw") {
    return {
      extraction: `${teamFilter}.score.fullTime`,
      transform: "score_diff",
      ruleType: "equals",
      ruleValue: 0,
      label: "Draw",
    };
  }

  const m = r.match(/^(home_goals|away_goals|total_goals)_gt:(\d+)$/);
  if (!m) {
    console.error(`Unknown rule: ${r}`);
    usage();
  }

  const [, target, threshold] = m;
  const n = Number(threshold);

  if (target === "total_goals") {
    return {
      extraction: `${teamFilter}.score.fullTime`,
      transform: "score_sum",
      ruleType: "greater_than",
      ruleValue: n,
      label: `Total goals > ${n}`,
    };
  }

  const side = target === "home_goals" ? "home" : "away";
  const teamName = side === "home" ? home : away;
  return {
    extraction: `${teamFilter}.score.fullTime.${side}`,
    transform: "decimal",
    ruleType: "greater_than",
    ruleValue: n,
    label: `${teamName} scores > ${n}`,
  };
}

const parsed = parseRule(rule);

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
const marketId = `epl-${slug(home)}-vs-${slug(away)}-md${matchday}-${season}`;

const spec: ResolutionSpec = {
  marketId,
  source: {
    type: "http",
    method: "GET",
    url: "https://api.football-data.org/v4/competitions/PL/matches",
    query: {
      matchday: Number(matchday),
      season: Number(season),
    },
    headers: {
      "X-Auth-Token": "$env:FOOTBALL_DATA_API_KEY",
    },
  },
  extraction: {
    type: "jsonpath",
    path: parsed.extraction,
  },
  transform: {
    type: parsed.transform,
  },
  rule: {
    type: parsed.ruleType,
    value: parsed.ruleValue,
  },
};

const outPath = output || `specs/${marketId}.json`;
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");

console.log(`Spec written: ${outPath}`);
console.log(`  Market:  ${marketId}`);
console.log(`  Match:   ${home} vs ${away} (matchday ${matchday}, season ${season})`);
console.log(`  Rule:    ${parsed.label}`);
console.log(`  Extract: ${parsed.extraction}`);
console.log(`  Transform: ${parsed.transform}`);
