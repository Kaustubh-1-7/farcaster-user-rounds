const { createPublicClient, http, createWalletClient } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
require('dotenv').config({ path: '../.env' });

const CONTRACT_ADDRESS = '0x31aC898cEc7aa64565B82b165C20930366C8902B';
const GLOWSTICK_ABI = [
  {
    "type": "function",
    "name": "currentRoundId",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextRoundId",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rounds",
    "inputs": [{"name": "", "type": "uint256"}],
    "outputs": [
      {"name": "startTime", "type": "uint256"},
      {"name": "startPrice", "type": "int256"},
      {"name": "endPrice", "type": "int256"},
      {"name": "upPool", "type": "uint256"},
      {"name": "downPool", "type": "uint256"},
      {"name": "status", "type": "uint8"},
      {"name": "priceWentUp", "type": "bool"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "manualResolve",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
]

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

async function main() {
  const currentRoundId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GLOWSTICK_ABI,
    functionName: 'currentRoundId',
  });
  console.log("Current Round ID:", currentRoundId);

  const nextRoundId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GLOWSTICK_ABI,
    functionName: 'nextRoundId',
  });
  console.log("Next Round ID:", nextRoundId);

  const roundData = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GLOWSTICK_ABI,
    functionName: 'rounds',
    args: [currentRoundId],
  });
  console.log("Current Round Data:", roundData);
  
  const now = Math.floor(Date.now() / 1000);
  console.log("Now:", now, "Diff:", now - Number(roundData[0]));

  if (now > Number(roundData[0]) + 60) {
      console.log("Round can be resolved. Resolving...");
      try {
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: GLOWSTICK_ABI,
          functionName: 'manualResolve',
          account,
        });
        const hash = await walletClient.writeContract(request);
        console.log("Resolve tx sent:", hash);
      } catch (e) {
          console.error("Error resolving", e.message);
      }
  }
}
main();
