import type { ResolutionSpec } from "../types.js";

export function transformValue(extracted: string, transform: ResolutionSpec["transform"]): string {
  if (transform.type === "decimal") {
    const num = parseFloat(extracted);
    if (isNaN(num)) {
      throw new Error(`Cannot parse "${extracted}" as decimal`);
    }
    return num.toString();
  }

  throw new Error(`Unknown transform type: ${transform.type}`);
}
