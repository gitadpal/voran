import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";

const abiPath = resolve(import.meta.dirname, "../../contracts/out/VoranOracle.sol/VoranOracle.json");
const artifact = JSON.parse(readFileSync(abiPath, "utf-8"));
export const voranAbi = artifact.abi;

export function getClients(privateKey: `0x${string}`, rpcUrl = "http://127.0.0.1:8545") {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);

  return {
    publicClient: createPublicClient({ chain: foundry, transport }),
    walletClient: createWalletClient({ chain: foundry, transport, account }),
    account,
  };
}
