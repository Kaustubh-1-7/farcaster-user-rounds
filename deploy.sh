#!/bin/bash
~/.foundry/bin/forge create src/GlowStick.sol:GlowStick \
  --rpc-url "https://base-sepolia.g.alchemy.com/v2/G3cqBZt8HPhE-A0dhouJNdPrNCx5iuNo" \
  --private-key "0xea400f28838c00563c782fd20ace425399b7da5585b57ca10efcb19e039a2aee" \
  --constructor-args "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3" \
  --verify \
  --etherscan-api-key "ND5SWBU6V1XYFMGM9BJGC7X1AXTB3ANNI2"
