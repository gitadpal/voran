# Voran

### Deterministic Single-Event Oracle Infrastructure

---

## 1. Overview

**Voran** is a deterministic, single-event oracle designed for secure on-chain settlement of external data conditions.

It replaces complex oracle networks for use cases that require:

* One-time data resolution
* Deterministic execution
* Transparent auditability
* Cryptographic verifiability

Voran is a **verifiable execution primitive** that provides:

* Transparent execution
* Deterministic settlement
* Spec-driven logic
* Minimal infrastructure
* Clear trust boundaries
* Reduced complexity compared to traditional oracle networks

Voran is meant to be a minimal, elegant primitive for single-event resolution in Web3 systems.

---

## 2. Design Principles

1. **Determinism over Intelligence**

   * No AI in settlement runtime.
   * No probabilistic parsing.
   * Pure function execution only.

2. **Single Immutable Execution Engine**

   * One universal workflow.
   * One deterministic resolver binary.
   * Audit once, reuse everywhere.

3. **Separation of Concerns**

   * Autonomous AI Data Layer (flexible)
   * Minimal Secure Settlement Primitive (deterministic)

4. **Spec-Driven Execution**

   * All resolution logic defined in structured JSON.
   * Hash of spec committed on-chain.
   * Settlement enforces exact spec match.

---

## 3. System Architecture

### Layer A — Autonomous AI Data Layer

Purpose:

* Translate human market intent into deterministic resolution specs.
* Generate structured `resolutionSpecJSON`.
* Provide tooling and monitoring.

Properties:

* Flexible
* Evolvable
* Not used during settlement

Never allowed to modify logic after spec is committed.

---

### Layer B — Minimal Secure Settlement Primitive

Purpose:

* Execute deterministic resolution spec.
* Sign and publish settlement result.

Properties:

* Frozen workflow
* Pinned container image
* Deterministic resolver binary
* No runtime AI
* No dynamic workflow generation

This layer settles funds.

---

## 4. Execution Flow

### Phase 1 — Market Creation

1. Human defines market condition.
2. AI layer compiles into `resolutionSpecJSON`.
3. Spec is reviewed.
4. `specHash = keccak256(resolutionSpecJSON)`
5. Smart contract stores:

   * `specHash`
   * Oracle public key
   * Market ID
   * Settlement window

Spec becomes immutable for this market.

---

### Phase 2 — Settlement Trigger

1. Settlement request sent (on-chain or via DID).
2. DID-controlled bot triggers GitHub Action.
3. Workflow executes universal resolver.
4. Resolver produces signed payload.
5. Payload submitted to smart contract.
6. Contract verifies and settles.

---

## 5. Universal Workflow

Only one GitHub Action workflow exists.

It:

* Checks out pinned repository commit
* Uses pinned container image
* Runs deterministic resolver binary
* Signs output
* Publishes result

Workflow YAML is never regenerated per market.

---

## 6. Resolution Specification (`resolutionSpecJSON`)

Structured deterministic spec.

Example (price check):

```json
{
  "marketId": "btc-jan1-2026",
  "source": {
    "type": "http",
    "method": "GET",
    "url": "https://api.coinbase.com/v2/prices/BTC-USD/spot"
  },
  "extraction": {
    "type": "jsonpath",
    "path": "$.data.amount"
  },
  "transform": {
    "type": "decimal"
  },
  "rule": {
    "type": "greater_than",
    "value": 100000
  },
  "timestampRule": {
    "type": "first_candle_after",
    "utc": "2026-01-01T12:00:00Z"
  }
}
```

Example (EPL match result — API key referenced via `$env:` placeholder):

```json
{
  "marketId": "epl-arsenalfc-vs-chelseafc-md29-2024",
  "source": {
    "type": "http",
    "method": "GET",
    "url": "https://api.football-data.org/v4/competitions/PL/matches",
    "query": { "matchday": 29, "season": 2024 },
    "headers": { "X-Auth-Token": "$env:FOOTBALL_DATA_API_KEY" }
  },
  "extraction": {
    "type": "jsonpath",
    "path": "$.matches[?(@.homeTeam.name=='Arsenal FC' && @.awayTeam.name=='Chelsea FC')].score.fullTime"
  },
  "transform": {
    "type": "score_diff"
  },
  "rule": {
    "type": "greater_than",
    "value": 0
  }
}
```

Supported transform types:

* `decimal` — parse extracted value as a number
* `score_diff` — compute home - away from a `{home, away}` score object
* `score_sum` — compute home + away from a `{home, away}` score object

Supported rule types:

* `greater_than` — value > threshold
* `less_than` — value < threshold
* `equals` — value = threshold

Header values support `$env:VAR_NAME` syntax to reference environment variables at runtime, keeping API keys out of committed spec files.

Constraints:

* No natural language
* No dynamic scripting
* No embedded code
* No randomness

Spec must describe a pure computation.

---

## 7. Deterministic Resolver Engine

Pseudo-implementation:

```pseudo
function run(spec):

    rawResponse = http_fetch(spec.source)

    rawHash = keccak256(rawResponse)

    extracted = apply_jsonpath(rawResponse, spec.extraction)

    transformed = apply_transform(extracted, spec.transform)

    result = evaluate_rule(transformed, spec.rule)

    payload = {
        marketId: keccak256(spec.marketId),
        specHash: keccak256(spec),
        rawHash: rawHash,
        parsedValue: transformed,
        result: result,
        executedAt: currentTimestamp()
    }

    return payload
```

Properties:

* Pure deterministic logic
* No external reasoning
* No state mutation
* Fully reproducible

---

## 8. Signing and Proof Payload

Final signed structure:

```json
{
  "marketId": "0x...",
  "specHash": "0x...",
  "rawHash": "0x...",
  "parsedValue": "105000.50",
  "result": true,
  "executedAt": 1767220860,
  "signature": "0x..."
}
```

Signature process:

```
messageHash = keccak256(abi.encodePacked(marketId, specHash, rawHash, parsedValue, result, executedAt))
signature = eip191_sign(messageHash, privateKey)
```

The contract reconstructs `messageHash` using the same `abi.encodePacked` layout and verifies via `ecrecover`.

Signing key:

* Registered on-chain (oracle address)
* ECDSA secp256k1 key pair (Ethereum-native)
* Stored securely (GitHub Secrets for CI, HSM recommended in production)

---

## 9. Smart Contract Verification

Contract verifies:

1. Signature validity
2. `specHash` matches stored value
3. Market ID matches
4. Settlement window valid
5. Result format correct

If valid → settle market.

Contract never:

* Calls APIs
* Parses JSON
* Executes resolution logic

---

## 10. Trust Model

Voran assumes trust in:

* External data source integrity
* GitHub runner integrity
* Signing key security

It does NOT assume:

* Multi-node consensus
* Byzantine fault tolerance
* Oracle aggregation

This is a single-execution proof model.

---

## 11. Security Model

### Risks

1. API manipulation
2. GitHub runner compromise
3. Signing key theft
4. Ambiguous timestamp rules

### Mitigations

* Pre-commit to exact endpoint
* Pin workflow commit hash
* Pin container image digest
* HSM-backed signing
* On-chain key rotation support
* Precise timestamp resolution definition

---

## 12. Suitable Use Cases

Ideal for:

* Prediction market settlement
* Insurance triggers
* Event-based DAO execution
* Binary outcome contracts
* One-time price resolution

Not suitable for:

* Liquidation engines
* Continuous price feeds
* Per-block DeFi integrations
* High-frequency trading oracles

---

## 13. Upgrade Path

Security can be improved without architectural changes:

* Replace GitHub runner with self-hosted runner
* Add remote attestation
* Migrate execution into TEE
* Add multi-signer quorum

Architecture remains stable due to spec-driven design.

---

## 14. Key Insight

Voran is `an AI-generated deterministic oracle` rather than “an AI oracle”.

AI helps create specs.
Deterministic engine settles markets.

This separation ensures both flexibility and finality.

