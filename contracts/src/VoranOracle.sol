// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VoranOracle {
    struct Market {
        bytes32 specHash;
        address oracle;
        uint64 settlementWindowStart;
        uint64 settlementWindowEnd;
        bool settled;
        bool result;
    }

    mapping(bytes32 => Market) public markets;

    event MarketCreated(bytes32 indexed marketId, bytes32 specHash, address oracle);
    event MarketSettled(bytes32 indexed marketId, bool result);

    function createMarket(
        bytes32 marketId,
        bytes32 specHash,
        address oracle,
        uint64 settlementWindowStart,
        uint64 settlementWindowEnd
    ) external {
        require(markets[marketId].oracle == address(0), "market exists");
        require(settlementWindowEnd > settlementWindowStart, "invalid window");

        markets[marketId] = Market({
            specHash: specHash,
            oracle: oracle,
            settlementWindowStart: settlementWindowStart,
            settlementWindowEnd: settlementWindowEnd,
            settled: false,
            result: false
        });

        emit MarketCreated(marketId, specHash, oracle);
    }

    function settle(
        bytes32 marketId,
        bytes32 specHash,
        bytes32 rawHash,
        string calldata parsedValue,
        bool result,
        uint64 executedAt,
        bytes calldata signature
    ) external {
        Market storage m = markets[marketId];
        require(!m.settled, "already settled");
        require(m.specHash == specHash, "spec mismatch");
        require(block.timestamp >= m.settlementWindowStart, "too early");
        require(block.timestamp <= m.settlementWindowEnd, "too late");

        bytes32 messageHash = keccak256(
            abi.encodePacked(marketId, specHash, rawHash, parsedValue, result, executedAt)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address signer = _recoverSigner(ethSignedHash, signature);
        require(signer == m.oracle, "invalid signer");

        m.settled = true;
        m.result = result;

        emit MarketSettled(marketId, result);
    }

    function getMarket(bytes32 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function _recoverSigner(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }

        return ecrecover(hash, v, r, s);
    }
}
