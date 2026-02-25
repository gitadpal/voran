import { fetchData } from "./fetch.js";
import { extractValue } from "./extract.js";
import { transformValue } from "./transform.js";
import { evaluateRule } from "./evaluate.js";
import { hashAndSign } from "./sign.js";
import type { ResolutionSpec, SignedPayload } from "../types.js";

export async function resolve(
  spec: ResolutionSpec,
  privateKey: `0x${string}`
): Promise<SignedPayload> {
  const rawResponse = await fetchData(spec.source);
  const extracted = extractValue(rawResponse, spec.extraction);
  const transformed = transformValue(extracted, spec.transform);
  const result = evaluateRule(transformed, spec.rule);
  return hashAndSign(spec, rawResponse, transformed, result, privateKey);
}
