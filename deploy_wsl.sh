#!/bin/bash
tr -d '\r' < .env > .env.unix
source .env.unix
~/.foundry/bin/forge script script/Deploy.s.sol:DeployGlowStick \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --sender 0xEa3e094a928a4E56F45A9EEeEaa38954b0dc0FeF \
  -vvvv
