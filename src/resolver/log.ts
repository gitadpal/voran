const MASK = "****";

function ts(): string {
  return new Date().toISOString();
}

function line(label: string, detail?: string) {
  const msg = detail ? `[${ts()}] ${label}: ${detail}` : `[${ts()}] ${label}`;
  console.error(msg);
}

function separator() {
  console.error("─".repeat(72));
}

/**
 * Mask sensitive header values ($env: resolved values, Authorization, tokens).
 */
function maskHeaders(headers?: Record<string, string>, rawHeaders?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const isSecret =
      rawHeaders?.[key]?.startsWith("$env:") ||
      key.toLowerCase().includes("auth") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("secret");
    masked[key] = isSecret ? MASK : value;
  }
  return masked;
}

export const log = {
  specLoaded(spec: { marketId: string; source: { url: string }; rule: { type: string; value: number } }) {
    separator();
    line("VORAN RESOLVER — AUDIT LOG");
    separator();
    line("Step 1/6 — Spec loaded");
    line("  Market ID", spec.marketId);
    line("  Source URL", spec.source.url);
    line("  Rule", `${spec.rule.type} ${spec.rule.value}`);
  },

  request(url: string, method: string, resolvedHeaders?: Record<string, string>, rawHeaders?: Record<string, string>) {
    separator();
    line("Step 2/6 — HTTP request");
    line("  Method", method);
    line("  URL", url);
    const masked = maskHeaders(resolvedHeaders, rawHeaders);
    if (Object.keys(masked).length > 0) {
      line("  Headers");
      for (const [k, v] of Object.entries(masked)) {
        line(`    ${k}`, v);
      }
    }
  },

  response(status: number, bodyLength: number, body: string) {
    separator();
    line("Step 3/6 — HTTP response");
    line("  Status", String(status));
    line("  Body length", `${bodyLength} bytes`);
    // Truncate large responses for readability
    const preview = body.length > 2000 ? body.slice(0, 2000) + "\n  ... (truncated)" : body;
    line("  Body");
    console.error(preview);
  },

  extraction(path: string, extracted: string) {
    separator();
    line("Step 4/6 — Extraction + Transform");
    line("  JSONPath", path);
    line("  Extracted", extracted);
  },

  transform(transformType: string, input: string, output: string) {
    line("  Transform", transformType);
    line("  Input", input);
    line("  Output", output);
  },

  evaluation(ruleType: string, ruleValue: number, parsedValue: string, result: boolean) {
    separator();
    line("Step 5/6 — Rule evaluation");
    line("  Rule", `${parsedValue} ${ruleType} ${ruleValue}`);
    line("  Result", String(result));
  },

  signing(specHash: string, rawHash: string, marketIdHash: string, signerAddress: string, executedAt: number) {
    separator();
    line("Step 6/6 — Hashing + Signing");
    line("  Spec hash", specHash);
    line("  Raw response hash", rawHash);
    line("  Market ID hash", marketIdHash);
    line("  Signer", signerAddress);
    line("  Executed at", `${executedAt} (${new Date(executedAt * 1000).toISOString()})`);
  },

  done(signature: string) {
    separator();
    line("SETTLEMENT PAYLOAD SIGNED");
    line("  Signature", signature);
    separator();
  },
};
