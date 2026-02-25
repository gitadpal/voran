#!/bin/bash
set -e

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://127.0.0.1:8545"

echo "=== Voran Local E2E ==="

# 1. Start Anvil
echo "[1/6] Starting Anvil..."
anvil --silent &
ANVIL_PID=$!
sleep 2

cleanup() {
  echo "Stopping Anvil (pid $ANVIL_PID)..."
  kill $ANVIL_PID 2>/dev/null || true
}
trap cleanup EXIT

# 2. Deploy contract
echo "[2/6] Deploying VoranOracle..."
DEPLOY_OUTPUT=$(forge script "$PROJ_DIR/contracts/script/Deploy.s.sol" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$ANVIL_KEY" 2>&1)

CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oP 'VoranOracle deployed at: \K0x[a-fA-F0-9]+')
echo "  Contract: $CONTRACT_ADDRESS"

if [ -z "$CONTRACT_ADDRESS" ]; then
  echo "ERROR: Could not extract contract address"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

# 3. Create market
echo "[3/6] Creating market from example spec..."
ORACLE_PRIVATE_KEY="$ANVIL_KEY" RPC_URL="$RPC_URL" \
  npx tsx "$PROJ_DIR/src/cli/create-market.ts" "$PROJ_DIR/specs/example-btc.json" "$CONTRACT_ADDRESS"

# 4. Run resolver
echo "[4/6] Running resolver..."
ORACLE_PRIVATE_KEY="$ANVIL_KEY" \
  npx tsx "$PROJ_DIR/src/cli/run-resolver.ts" "$PROJ_DIR/specs/example-btc.json" > /tmp/voran-result.json 2>/dev/null

echo "  Resolver output:"
cat /tmp/voran-result.json

# 5. Settle market
echo "[5/6] Settling market..."
ORACLE_PRIVATE_KEY="$ANVIL_KEY" RPC_URL="$RPC_URL" \
  npx tsx "$PROJ_DIR/src/cli/settle-market.ts" /tmp/voran-result.json "$CONTRACT_ADDRESS"

# 6. Done
echo ""
echo "[6/6] E2E Complete!"
echo "=== All steps passed ==="
