// @ts-ignore
import sodium from "libsodium-wrappers";

async function main() {
  await sodium.ready;

  const PAT = process.argv[2];
  const secretValue = process.argv[3];
  const secretName = process.argv[4] || "FOOTBALL_DATA_API_KEY";

  const headers = {
    Authorization: `Bearer ${PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const pkRes = await fetch("https://api.github.com/repos/gitadpal/voran/actions/secrets/public-key", { headers });
  const { key: pubKeyB64, key_id } = (await pkRes.json()) as { key: string; key_id: string };

  const pubKey = sodium.from_base64(pubKeyB64, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.crypto_box_seal(sodium.from_string(secretValue), pubKey);
  const encB64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

  const res = await fetch(`https://api.github.com/repos/gitadpal/voran/actions/secrets/${secretName}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ encrypted_value: encB64, key_id }),
  });

  console.log(res.status === 201 || res.status === 204 ? `${secretName} secret set!` : `Failed: ${res.status}`);
}

main();
