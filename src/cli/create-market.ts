import { readFileSync } from "fs";
import { keccak256, toBytes } from "viem";
import { getClients, voranAbi } from "../lib/contract.js";
import type { ResolutionSpec } from "../types.js";

const specPath = process.argv[2];
const contractAddress = process.argv[3] || process.env.CONTRACT_ADDRESS;
const privateKey = (process.env.ORACLE_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";

if (!specPath || !contractAddress) {
  console.error("Usage: tsx src/cli/create-market.ts <spec.json> [contract-address]");
  console.error("  Or set CONTRACT_ADDRESS env var");
  process.exit(1);
}

const spec: ResolutionSpec = JSON.parse(readFileSync(specPath, "utf-8"));

// Canonical JSON serialization — must match resolver's sign.ts
const specCanonical = JSON.stringify(spec);
const marketId = keccak256(toBytes(spec.marketId));
const specHash = keccak256(toBytes(specCanonical));

// Default: settlement window from now to +1 hour
const now = Math.floor(Date.now() / 1000);
const windowStart = BigInt(now - 60);
const windowEnd = BigInt(now + 3600);

const { publicClient, walletClient, account } = getClients(privateKey, rpcUrl);

console.log("Creating market...");
console.log("  marketId:", marketId);
console.log("  specHash:", specHash);
console.log("  oracle:", account.address);
console.log("  window:", `${windowStart} - ${windowEnd}`);

const hash = await walletClient.writeContract({
  address: contractAddress as `0x${string}`,
  abi: voranAbi,
  functionName: "createMarket",
  args: [marketId, specHash, account.address, windowStart, windowEnd],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Market created! tx:", receipt.transactionHash);
