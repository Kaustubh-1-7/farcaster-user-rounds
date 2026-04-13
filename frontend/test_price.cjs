const { createPublicClient, http, formatUnits } = require('viem');
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
  }
]

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

async function main() {
  const currentRoundId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GLOWSTICK_ABI,
    functionName: 'currentRoundId',
  });
  const roundData = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GLOWSTICK_ABI,
    functionName: 'rounds',
    args: [currentRoundId],
  });
  console.log("Current Round Price:", formatUnits(roundData[1], 8));
}
main();
