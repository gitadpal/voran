import { readFileSync } from "fs";
import { resolve } from "../resolver/index.js";
import { getLastScreenshotPath } from "../resolver/fetch.js";
import type { ResolutionSpec } from "../types.js";

const specPath = process.argv[2];
const privateKey = (process.env.ORACLE_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

if (!specPath) {
  console.error("Usage: tsx src/cli/run-resolver.ts <spec.json>");
  process.exit(1);
}

const spec: ResolutionSpec = JSON.parse(readFileSync(specPath, "utf-8"));

const payload = await resolve(spec, privateKey);

// Output signed payload as JSON to stdout
console.log(JSON.stringify(payload, null, 2));

const screenshotPath = getLastScreenshotPath();
if (screenshotPath) {
  console.error(`Screenshot: ${screenshotPath}`);
}
