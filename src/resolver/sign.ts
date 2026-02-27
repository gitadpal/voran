import { keccak256, encodePacked, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ResolutionSpec, SignedPayload } from "../types.js";

export async function hashAndSign(
  spec: ResolutionSpec,
  rawResponse: string,
  parsedValue: string,
  result: boolean,
  privateKey: `0x${string}`
): Promise<SignedPayload> {
  const specHash = keccak256(toBytes(JSON.stringify(spec)));
  const rawHash = keccak256(toBytes(rawResponse));
  const marketId = keccak256(toBytes(spec.marketId));
  const executedAt = Math.floor(Date.now() / 1000);

  // Must match Solidity: keccak256(abi.encodePacked(marketId, specHash, rawHash, parsedValue, result, executedAt))
  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "bytes32", "bytes32", "string", "bool", "uint64"],
      [marketId, specHash, rawHash, parsedValue, result, BigInt(executedAt)]
    )
  );

  const account = privateKeyToAccount(privateKey);
  const signature = await account.signMessage({ message: { raw: toBytes(messageHash) } });

  return {
    marketId,
    specHash,
    rawHash,
    parsedValue,
    result,
    executedAt,
    signature,
  };
}

export function getSignerAddress(privateKey: `0x${string}`): string {
  return privateKeyToAccount(privateKey).address;
}
