# Chainlink Automation Setup (Sepolia)

This project uses a **custom logic upkeep** for user-based rounds.

## Deployed Contract

- Network: Sepolia
- Contract: `0xa6311F2973528bE6F076f90aD514c19b77453444`
- check function: `checkUpkeep(bytes)`
- perform function: `performUpkeep(bytes)`

## What Automation Does

- Scans active user rounds (`activeUsers`) in `checkUpkeep`.
- If any user round has passed 60 seconds, returns:
  - `upkeepNeeded = true`
  - `performData = abi.encode(userAddress)`
- `performUpkeep` decodes that user address and settles that specific user round.
- One upkeep execution settles one matured user per tx. If many are matured, Automation will run again.

## Register Upkeep in Chainlink UI

1. Open Chainlink Automation app and select **Sepolia**.
2. Choose **Custom Logic Upkeep**.
3. Enter the target contract: `0xa6311F2973528bE6F076f90aD514c19b77453444`.
4. Check data: `0x` (empty bytes).
5. Gas limit: start with `500000`.
6. Fund upkeep with LINK (or supported billing token in the UI).
7. Confirm registration.

## Required Funding (Important)

Automation funding is separate from game payouts.

- **Automation balance**: funds Chainlink keeper executions.
- **Contract vault balance**: funds game payouts + faucet.

Top up contract vault by sending Sepolia ETH directly to the contract address.

## Quick Verification Commands (optional)

From project root (WSL + Foundry/cast):

```bash
cast call 0xa6311F2973528bE6F076f90aD514c19b77453444 "activeUsersCount()(uint256)" --rpc-url $SEPOLIA_RPC_URL
cast call 0xa6311F2973528bE6F076f90aD514c19b77453444 "checkUpkeep(bytes)(bool,bytes)" 0x --rpc-url $SEPOLIA_RPC_URL
```

Manual fallback settle (if needed):

```bash
cast send 0xa6311F2973528bE6F076f90aD514c19b77453444 "performUpkeep(bytes)" <performData> --private-key $PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL
```

## Frontend Status

Frontend points to the same deployed contract in:

- `frontend/app/api/[[...routes]]/route.tsx`
