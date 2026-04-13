#!/bin/bash
~/.foundry/bin/forge create src/GlowStick.sol:GlowStick \
  --rpc-url "https://eth-sepolia.g.alchemy.com/v2/G3cqBZt8HPhE-A0dhouJNdPrNCx5iuNo" \
  --private-key "0xea400f28838c00563c782fd20ace425399b7da5585b57ca10efcb19e039a2aee" \
  --constructor-args "0x694AA1769357215DE4FAC081bf1f309aDC325306" \
  --verify \
  --etherscan-api-key "ND5SWBU6V1XYFMGM9BJGC7X1AXTB3ANNI2"
