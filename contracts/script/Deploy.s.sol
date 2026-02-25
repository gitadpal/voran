// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/VoranOracle.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        VoranOracle oracle = new VoranOracle();
        vm.stopBroadcast();

        console.log("VoranOracle deployed at:", address(oracle));
    }
}
