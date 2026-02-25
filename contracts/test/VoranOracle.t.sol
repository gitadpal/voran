// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/VoranOracle.sol";

contract VoranOracleTest is Test {
    VoranOracle oracle;

    uint256 constant ORACLE_PK = 0xA11CE;
    address oracleAddr;

    bytes32 marketId = keccak256("btc-jan1-2026");
    bytes32 specHash = keccak256("test-spec");
    uint64 windowStart = 1000;
    uint64 windowEnd = 2000;

    function setUp() public {
        oracle = new VoranOracle();
        oracleAddr = vm.addr(ORACLE_PK);
        vm.warp(1500); // within settlement window
    }

    function _createMarket() internal {
        oracle.createMarket(marketId, specHash, oracleAddr, windowStart, windowEnd);
    }

    function _signAndSettle(
        bytes32 _marketId,
        bytes32 _specHash,
        bytes32 _rawHash,
        string memory _parsedValue,
        bool _result,
        uint64 _executedAt
    ) internal returns (bytes memory signature) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(_marketId, _specHash, _rawHash, _parsedValue, _result, _executedAt)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, ethSignedHash);
        signature = abi.encodePacked(r, s, v);
    }

    // --- Happy path ---

    function test_createMarket() public {
        _createMarket();
        VoranOracle.Market memory m = oracle.getMarket(marketId);
        assertEq(m.specHash, specHash);
        assertEq(m.oracle, oracleAddr);
        assertFalse(m.settled);
    }

    function test_settle() public {
        _createMarket();

        bytes32 rawHash = keccak256("raw-response");
        string memory parsedValue = "105000.50";
        bool result = true;
        uint64 executedAt = 1500;

        bytes memory sig = _signAndSettle(marketId, specHash, rawHash, parsedValue, result, executedAt);
        oracle.settle(marketId, specHash, rawHash, parsedValue, result, executedAt, sig);

        VoranOracle.Market memory m = oracle.getMarket(marketId);
        assertTrue(m.settled);
        assertTrue(m.result);
    }

    // --- Revert cases ---

    function test_revert_duplicateMarket() public {
        _createMarket();
        vm.expectRevert("market exists");
        _createMarket();
    }

    function test_revert_invalidWindow() public {
        vm.expectRevert("invalid window");
        oracle.createMarket(marketId, specHash, oracleAddr, 2000, 1000);
    }

    function test_revert_specMismatch() public {
        _createMarket();

        bytes32 wrongSpec = keccak256("wrong-spec");
        bytes32 rawHash = keccak256("raw");
        bytes memory sig = _signAndSettle(marketId, wrongSpec, rawHash, "100", true, 1500);

        vm.expectRevert("spec mismatch");
        oracle.settle(marketId, wrongSpec, rawHash, "100", true, 1500, sig);
    }

    function test_revert_tooEarly() public {
        _createMarket();
        vm.warp(999); // before window

        bytes32 rawHash = keccak256("raw");
        bytes memory sig = _signAndSettle(marketId, specHash, rawHash, "100", true, 999);

        vm.expectRevert("too early");
        oracle.settle(marketId, specHash, rawHash, "100", true, 999, sig);
    }

    function test_revert_tooLate() public {
        _createMarket();
        vm.warp(2001); // after window

        bytes32 rawHash = keccak256("raw");
        bytes memory sig = _signAndSettle(marketId, specHash, rawHash, "100", true, 2001);

        vm.expectRevert("too late");
        oracle.settle(marketId, specHash, rawHash, "100", true, 2001, sig);
    }

    function test_revert_wrongSigner() public {
        _createMarket();

        uint256 wrongPk = 0xBAD;
        bytes32 rawHash = keccak256("raw");

        bytes32 messageHash = keccak256(
            abi.encodePacked(marketId, specHash, rawHash, "100", true, uint64(1500))
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ethSignedHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert("invalid signer");
        oracle.settle(marketId, specHash, rawHash, "100", true, 1500, sig);
    }

    function test_revert_doubleSettle() public {
        _createMarket();

        bytes32 rawHash = keccak256("raw");
        bytes memory sig = _signAndSettle(marketId, specHash, rawHash, "100", true, 1500);

        oracle.settle(marketId, specHash, rawHash, "100", true, 1500, sig);

        vm.expectRevert("already settled");
        oracle.settle(marketId, specHash, rawHash, "100", true, 1500, sig);
    }
}
