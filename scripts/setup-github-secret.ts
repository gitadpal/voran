import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// @ts-ignore
import sodium from "libsodium-wrappers";

const PAT = process.argv[2];
const owner = process.argv[3] || "gitadpal";
const repo = process.argv[4] || "voran";

if (!PAT) {
  console.error("Usage: tsx scripts/setup-github-secret.ts <github-pat>");
  process.exit(1);
}

await sodium.ready;

// 1. Generate fresh oracle key
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Generated oracle key:");
console.log("  Address:", account.address);
console.log("  Private key: [stored as GitHub secret]");

// 2. Get repo public key for secret encryption
const headers = {
  Authorization: `Bearer ${PAT}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const pubKeyRes = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
  { headers }
);

if (!pubKeyRes.ok) {
  console.error("Failed to get repo public key:", pubKeyRes.status, await pubKeyRes.text());
  process.exit(1);
}

const { key: pubKeyB64, key_id } = (await pubKeyRes.json()) as { key: string; key_id: string };

// 3. Encrypt using libsodium crypto_box_seal (what GitHub expects)
const pubKeyBytes = sodium.from_base64(pubKeyB64, sodium.base64_variants.ORIGINAL);
const secretBytes = sodium.from_string(privateKey);
const encrypted = sodium.crypto_box_seal(secretBytes, pubKeyBytes);
const encryptedB64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

// 4. Set the secret
const setRes = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/actions/secrets/ORACLE_PRIVATE_KEY`,
  {
    method: "PUT",
    headers,
    body: JSON.stringify({
      encrypted_value: encryptedB64,
      key_id,
    }),
  }
);

if (setRes.status === 201 || setRes.status === 204) {
  console.log("ORACLE_PRIVATE_KEY secret set successfully!");
  console.log(`Oracle address: ${account.address}`);
  console.log("(Save this address — it's the oracle signer for on-chain market creation)");
} else {
  console.error("Failed to set secret:", setRes.status, await setRes.text());
  process.exit(1);
}
