import { fetchSource } from "./fetch.js";
import { extractValue } from "./extract.js";
import { transformValue } from "./transform.js";
import { evaluateRule } from "./evaluate.js";
import { hashAndSign, getSignerAddress } from "./sign.js";
import { log } from "./log.js";
import type { ResolutionSpec, SignedPayload } from "../types.js";

export async function resolve(
  spec: ResolutionSpec,
  privateKey: `0x${string}`
): Promise<SignedPayload> {
  log.specLoaded(spec);

  // Step 2+3 (request + response) are logged inside fetchSource for HTTP sources
  const rawResponse = await fetchSource(spec.source);

  const extracted = extractValue(rawResponse, spec.extraction);
  log.extraction(spec.extraction, extracted);

  const transformed = transformValue(extracted, spec.transform);
  log.transform(spec.transform.type, extracted, transformed);

  const result = evaluateRule(transformed, spec.rule);
  log.evaluation(spec.rule.type, spec.rule.value, transformed, result);

  const payload = await hashAndSign(spec, rawResponse, transformed, result, privateKey);
  log.signing(payload.specHash, payload.rawHash, payload.marketId, getSignerAddress(privateKey), payload.executedAt);
  log.done(payload.signature);

  return payload;
}
