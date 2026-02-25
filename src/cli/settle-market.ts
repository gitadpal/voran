import { readFileSync } from "fs";
import { getClients, voranAbi } from "../lib/contract.js";
import type { SignedPayload } from "../types.js";

const payloadPath = process.argv[2];
const contractAddress = process.argv[3] || process.env.CONTRACT_ADDRESS;
const privateKey = (process.env.ORACLE_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";

if (!payloadPath || !contractAddress) {
  console.error("Usage: tsx src/cli/settle-market.ts <payload.json> [contract-address]");
  console.error("  Or set CONTRACT_ADDRESS env var");
  process.exit(1);
}

const payload: SignedPayload = JSON.parse(readFileSync(payloadPath, "utf-8"));

const { publicClient, walletClient } = getClients(privateKey, rpcUrl);

console.log("Settling market...");
console.log("  marketId:", payload.marketId);
console.log("  result:", payload.result);
console.log("  parsedValue:", payload.parsedValue);

const hash = await walletClient.writeContract({
  address: contractAddress as `0x${string}`,
  abi: voranAbi,
  functionName: "settle",
  args: [
    payload.marketId,
    payload.specHash,
    payload.rawHash,
    payload.parsedValue,
    payload.result,
    BigInt(payload.executedAt),
    payload.signature,
  ],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Market settled! tx:", receipt.transactionHash);

// Verify on-chain
const market = await publicClient.readContract({
  address: contractAddress as `0x${string}`,
  abi: voranAbi,
  functionName: "getMarket",
  args: [payload.marketId],
});

console.log("On-chain market state:", market);
