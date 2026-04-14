# GlowStick Bomb

GlowStick Bomb is a high-velocity, 60-second Ethereum price prediction game designed exclusively as an interactive Farcaster Frame. It brings the adrenaline of decentralized finance right into your social feed. 

Predict if the price of Ethereum will go **UP** or **DOWN**, lock in your stake directly from your social timeline, and instantly double your ETH (minus a minor treasury fee) if you're right. No exchanges, no fragmented experiences.

## Features
*   **Seamless In-Feed Betting**: Built as an interactive Farcaster Frame to bring predictive markets into the Web3 social layer.
*   **60-Second Rapid Settlement**: High adrenaline, fast resolutions.
*   **Cryptographically Secure**: Implements robust signature verification architecture bridging the Next.js backend to the Ethereum smart contract.
*   **Decentralized Smart Contract Escrow**: Predict transparently without counterparty risks. 
*   **Real-time Oracle Integrations**: Pulls live ETH/USDT price data to settle the bets dynamically.

## Stack
*   **Frontend**: Built with **Next.js** and the **Frog.js** framework for rendering rich Farcaster Frames.
*   **Web3 Integration**: Features **Viem** for lightning-fast Ethereum interactions and cryptographic signatures.
*   **Smart Contracts**: Written in **Solidity** using **Foundry** as the development, testing, and deployment environment.
*   **Network**: Live natively on the **Ethereum Sepolia** testnet.

## Getting Started

### 1. Root .env Configuration
In the root directory, create a `.env` file according to this template:
```env
# 1. Your Ethereum Sepolia RPC URL (From Alchemy, Infura, or QuickNode)
SEPOLIA_RPC_URL="https://eth-sepolia..."

# 2. Your Wallet Private Key (Make sure this wallet has some Sepolia Test ETH in it!)
PRIVATE_KEY="your_private_key_here"

# 3. Your Etherscan API Key for Sepolia (Deploying)
ETHERSCAN_API_KEY="your_etherscan_key_here"
```

**Important:** You must ensure this `.env` file is also copied to your `/frontend` directory for Next.js to properly read the environment variables!

### 2. Smart Contracts (Foundry)
To build and test the Solidity Smart Contracts:
```bash
# Build contracts
forge build

# Run unit tests
forge test
```

### 3. Frontend Development Server
Start the frontend server to interact with the GlowStick Bomb Farcaster Frame via DevTools:
```bash
cd frontend
npm install

# Run the dev server
npm run dev
```

Navigate to `http://localhost:3000/api/dev` and enter **`http://localhost:3000/api/start`** into the address bar to open the primary Game interface!

## Architecture Note
The protocol utilizes an _Authorizer_ paradigm. The backend generates a signed structural hash of the user, the direction (UP/DOWN), and the live timestamped price. 
The Smart Contract validates this backend signature `_verifySignature()` prior to executing the bet on-chain. This effectively prevents users from directly sniping or manipulating the contract with spoofed oracle prices.
