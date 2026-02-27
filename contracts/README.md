## Voran Smart Contracts

Solidity contracts for the Voran oracle, built with [Foundry](https://book.getfoundry.sh/).

### VoranOracle.sol

Core contract that stores markets and verifies signed settlement payloads.

**Functions:**

- `createMarket(bytes32 marketId, bytes32 specHash, address oracle, uint64 windowStart, uint64 windowEnd)` — register a new market with its spec hash and authorized oracle signer
- `settle(bytes32 marketId, bytes32 specHash, bytes32 rawHash, string parsedValue, bool result, uint64 executedAt, bytes signature)` — submit a signed resolver payload to settle a market
- `getMarket(bytes32 marketId)` — read market state

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Deploy (local Anvil)

```shell
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <key>
```
