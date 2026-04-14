// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/GlowStick.sol";

contract DeployGlowStick is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address authorizer = vm.addr(deployerPrivateKey); // Authorizer is the deployer

        vm.startBroadcast(deployerPrivateKey);

        GlowStick glowStick = new GlowStick(authorizer);

        vm.stopBroadcast();
    }
}
