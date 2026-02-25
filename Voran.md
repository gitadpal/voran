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

Voran is not a data feed network.
It is a **verifiable execution primitive**.

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
4. `specHash = sha256(resolutionSpecJSON)`
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

Example:

```json
{
  "marketId": "btc-jan1-2026",
  "source": {
    "type": "http",
    "method": "GET",
    "url": "https://api.binance.com/api/v3/klines",
    "query": {
      "symbol": "BTCUSDT",
      "interval": "1m",
      "startTime": 1767220800000,
      "limit": 1
    }
  },
  "extraction": {
    "type": "jsonpath",
    "path": "$[0][4]"
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

    rawHash = sha256(rawResponse)

    extracted = apply_jsonpath(rawResponse, spec.extraction)

    transformed = apply_transform(extracted)

    result = evaluate_rule(transformed, spec.rule)

    payload = {
        marketId: spec.marketId,
        specHash: sha256(spec),
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
  "marketId": "...",
  "specHash": "...",
  "rawHash": "...",
  "parsedValue": "...",
  "result": true,
  "workflowCommitHash": "...",
  "executedAt": 1767220860
}
```

Signature:

```
signature = sign(sha256(payload))
```

Signing key:

* Registered on-chain
* Controlled by DID identity
* Stored securely (HSM recommended in production)

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

Voran is not:

“An AI oracle.”

It is:

> An AI-generated deterministic oracle.

AI helps create specs.
Deterministic engine settles markets.

This separation ensures both flexibility and finality.

---

## 15. Summary

Voran provides:

* Transparent execution
* Deterministic settlement
* Spec-driven logic
* Minimal infrastructure
* Clear trust boundaries
* Reduced complexity compared to traditional oracle networks

It is a minimal, elegant primitive for single-event resolution in Web3 systems.
