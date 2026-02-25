import type { ResolutionSpec } from "../types.js";

export function transformValue(extracted: string, transform: ResolutionSpec["transform"]): string {
  if (transform.type === "decimal") {
    const num = parseFloat(extracted);
    if (isNaN(num)) {
      throw new Error(`Cannot parse "${extracted}" as decimal`);
    }
    return num.toString();
  }

  if (transform.type === "score_diff") {
    // Expects extracted to be a JSON object like {"home":1,"away":0}
    const score = parseScore(extracted);
    return (score.home - score.away).toString();
  }

  if (transform.type === "score_sum") {
    const score = parseScore(extracted);
    return (score.home + score.away).toString();
  }

  throw new Error(`Unknown transform type: ${transform.type}`);
}

function parseScore(extracted: string): { home: number; away: number } {
  let obj: unknown;
  try {
    obj = JSON.parse(extracted);
  } catch {
    throw new Error(`Cannot parse score object: "${extracted}"`);
  }

  const score = obj as { home: unknown; away: unknown };
  const home = Number(score.home);
  const away = Number(score.away);

  if (isNaN(home) || isNaN(away)) {
    throw new Error(`Invalid score values: home=${score.home}, away=${score.away}`);
  }

  return { home, away };
}
