import type { ResolutionSpec } from "../types.js";

export function evaluateRule(parsedValue: string, rule: ResolutionSpec["rule"]): boolean {
  const value = parseFloat(parsedValue);

  switch (rule.type) {
    case "greater_than":
      return value > rule.value;
    case "less_than":
      return value < rule.value;
    case "equals":
      return value === rule.value;
    default:
      throw new Error(`Unknown rule type: ${(rule as { type: string }).type}`);
  }
}
