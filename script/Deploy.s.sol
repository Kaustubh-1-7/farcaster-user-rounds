// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/GlowStick.sol";

contract DeployGlowStick is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address priceFeed = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Sepolia ETH/USD

        vm.startBroadcast(deployerPrivateKey);

        GlowStick glowStick = new GlowStick(priceFeed);

        vm.stopBroadcast();
    }
}
