/** @jsxImportSource frog/jsx */

import { Button, Frog, TextInput } from 'frog'
import { devtools } from 'frog/dev'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'
import { createPublicClient, formatUnits, http, parseEther, keccak256, encodePacked } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CONTRACT_ADDRESS = '0x045990F11B9d9e0B68EaF5248dDfBC9A963F639D'

const rawPk = process.env.PRIVATE_KEY?.replace(/^0x/, '') || '0000000000000000000000000000000000000000000000000000000000000000'
const account = privateKeyToAccount(`0x${rawPk}`)

const GLOWSTICK_ABI = [
  {
    type: 'function',
    name: 'bet',
    inputs: [
      { name: '_isUp', type: 'bool' },
      { name: '_binancePrice', type: 'int256' },
      { name: '_deadline', type: 'uint256' },
      { name: '_signature', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'settleMyRound',
    inputs: [
      { name: '_binancePrice', type: 'int256' },
      { name: '_deadline', type: 'uint256' },
      { name: '_signature', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'activeRounds',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'startPrice', type: 'int256' },
      { name: 'endPrice', type: 'int256' },
      { name: 'amount', type: 'uint256' },
      { name: 'isUp', type: 'bool' },
      { name: 'settled', type: 'bool' },
      { name: 'won', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingWithdrawals',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVaultBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'activeUsersCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [{ name: '_roundId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'faucet',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
})

const app = new Frog({
  assetsPath: '/',
  basePath: '/api',
  title: 'GlowStick Bomb',
})

async function getUserAddress(c: any, urlParam?: string): Promise<`0x${string}` | undefined> {
  if (urlParam && urlParam.startsWith('0x')) return urlParam as `0x${string}`
  
  if (c?.address && c.address.startsWith('0x')) return c.address as `0x${string}`

  if (c?.var?.interactor?.verifiedAccounts?.[0]) return c.var.interactor.verifiedAccounts[0] as `0x${string}`
  if (c?.var?.interactor?.verifiedAddresses?.ethAddresses?.[0]) return c.var.interactor.verifiedAddresses.ethAddresses[0] as `0x${string}`

  if (c?.frameData?.address && c.frameData.address.startsWith('0x')) return c.frameData.address as `0x${string}`
  if (c?.frameData?.custodyAddress && c.frameData.custodyAddress.startsWith('0x')) return c.frameData.custodyAddress as `0x${string}`

  if (c?.transactionId) {
    try {
      const tx = await publicClient.getTransaction({ hash: c.transactionId as `0x${string}` })
      if (tx && tx.from) return tx.from
    } catch(e) {}
  }

  return undefined
}

app.frame('/', (c) => {
  return c.res({
    image: (
      <div
        style={{
          alignItems: 'center',
          background: 'radial-gradient(circle at 50% 50%, #111111 0%, #000000 100%)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          width: '100%',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        <h1 style={{ fontSize: 75, margin: 0, color: '#00ffcc' }}>GlowStick Bomb</h1>
        <p style={{ fontSize: 34, marginTop: 14 }}>User-based 60s prediction rounds</p>
      </div>
    ),
    intents: [
      <Button action="/play">🎮 Play Now</Button>,
    ],
  })
})

app.frame('/play', async (c) => { return playFrame(c) })
app.frame('/play/:addr', async (c) => { return playFrame(c, c.req.param('addr')) })

async function playFrame(c: any, explicitAddr?: string) {
  const userAddress = await getUserAddress(c, explicitAddr)
  const forwardAddr = userAddress || ''

  let latestPrice = '--'
  let vaultEth = '--'
  let autoQueue = '0'
  let roundId = 0
  let timeLeft = 0
  let isSettled = false
  let direction = 'UP'
  let amountEth = '0'
  let pendingEth = '0'

  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
    const data = await res.json()
    latestPrice = parseFloat(data.price).toFixed(2)
  } catch (e) {}

  try {
    const vb = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: GLOWSTICK_ABI, functionName: 'getVaultBalance' })
    vaultEth = formatUnits(vb as bigint, 18)
    const au = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: GLOWSTICK_ABI, functionName: 'activeUsersCount' })
    autoQueue = au.toString()
  } catch (e) {}

  if (userAddress) {
    try {
      const r = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: GLOWSTICK_ABI,
        functionName: 'activeRounds',
        args: [userAddress],
      })

      roundId = Number(r[0])
      isSettled = Boolean(r[6])
      direction = Boolean(r[5]) ? 'UP' : 'DOWN'
      amountEth = formatUnits(r[4] as bigint, 18)

      if (roundId > 0 && !isSettled) {
        const startTime = Number(r[1])
        const now = Math.floor(Date.now() / 1000)
        timeLeft = Math.max(0, 60 - (now - startTime))
      }

      const pending = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: GLOWSTICK_ABI,
        functionName: 'pendingWithdrawals',
        args: [userAddress],
      })
      pendingEth = formatUnits(pending as bigint, 18)
    } catch (e) { }
  }

  const hasActive = roundId > 0 && !isSettled
  const automationDelayHint = 'Automation may take ~10-60s on Sepolia.'

  const intents = hasActive
    ? timeLeft > 0
      ? [
          <Button action={`/waiting/${forwardAddr}`}>⏱ Live Timer</Button>,
        ]
      : [
          <Button action={`/waiting/${forwardAddr}`}>⏳ Wait Block</Button>,
          <Button.Transaction target="/settle" action={`/result/${forwardAddr}`}>⚙️ Manual Settle</Button.Transaction>,
          <Button action={`/result/${forwardAddr}`}>📊 View Result</Button>,
        ]
    : [
        <TextInput placeholder="Stake Amount (e.g., 0.01)" />,
        <Button.Transaction target="/bet/up" action={`/waiting`}>📈 UP</Button.Transaction>,
        <Button.Transaction target="/bet/down" action={`/waiting`}>📉 DOWN</Button.Transaction>,
        <Button action={`/play/${forwardAddr}`}>🔄 Refresh</Button>,
      ]

  return c.res({
    image: (
      <div style={{ alignItems: 'center', background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #16213e 100%)', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', fontFamily: 'sans-serif', color: 'white' }}>
        <h1 style={{ fontSize: 58, color: '#e94560', margin: 0 }}>Place Your Bet!</h1>
        <p style={{ fontSize: 30, color: '#00ffcc', marginTop: 10, marginBottom: 0 }}>Current Price: ${latestPrice}</p>
        <p style={{ fontSize: 20, color: '#d5d8ff', marginTop: 8, marginBottom: 0 }}>Vault: {vaultEth} ETH | Queue: {autoQueue}</p>
        <p style={{ fontSize: 18, color: '#aaa', marginTop: 6, marginBottom: 0 }}>Pending Payout: {pendingEth} ETH</p>
        {hasActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, alignItems: 'center' }}>
            <p style={{ fontSize: 30, margin: 0 }}>Round #{roundId} ({direction})</p>
            <p style={{ fontSize: 24, color: '#aaa', marginTop: 8 }}>Stake: {amountEth} ETH</p>
            <p style={{ fontSize: 40, marginTop: 14 }}>[ {timeLeft > 0 ? `${timeLeft}s` : 'READY TO SETTLE'} ]</p>
            {timeLeft === 0 ? <p style={{ fontSize: 18, color: '#ffd98f', marginTop: 8 }}>{automationDelayHint}</p> : null}
          </div>
        ) : (
          <p style={{ fontSize: 24, color: '#aaa', marginTop: 22, textAlign: 'center', padding: '0 40px' }}>
            Predict if price goes up or down in the next 60 seconds.
          </p>
        )}
      </div>
    ),
    intents,
  })
}

app.frame('/waiting', async (c) => { return waitingFrame(c) })
app.frame('/waiting/:addr', async (c) => { return waitingFrame(c, c.req.param('addr')) })

async function waitingFrame(c: any, explicitAddr?: string) {
  const userAddress = await getUserAddress(c, explicitAddr)
  const forwardAddr = userAddress || ''

  if (!userAddress) {
    return c.res({
      image: (
        <div style={{ alignItems: 'center', background: '#222', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56, color: '#ff6b6b' }}>Error: Wallet address lost!</h1>
          <p style={{ fontSize: 28, marginTop: 10, padding: '0 40px', textAlign: 'center' }}>Devtools simulator couldn't map your profile. Please press Back to Play.</p>
        </div>
      ),
      intents: [<Button action="/play">⬅️ Back to Play</Button>],
    })
  }

  let roundId = 0
  let startTime = 0
  let startPrice = '--'
  let direction = 'UP'
  let isSettled = false

  try {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: GLOWSTICK_ABI,
      functionName: 'activeRounds',
      args: [userAddress],
    })
    roundId = Number(r[0])
    startTime = Number(r[1])
    if (r[2]) startPrice = formatUnits(r[2] as bigint, 8)
    direction = Boolean(r[5]) ? 'UP' : 'DOWN'
    isSettled = Boolean(r[6])
  } catch (e) {}

  if (c.transactionId && isSettled) {
     return c.res({
       headers: { Refresh: '2' },
       image: (
         <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
           <h1 style={{ fontSize: 50, color: '#ffd98f' }}>Fetching New Bet...</h1>
           <p style={{ fontSize: 24, marginTop: 14 }}>Transaction was mined. Waiting for blockchain nodes to sync state.</p>
         </div>
       ),
       intents: [ <Button action={`/waiting/${forwardAddr}`}>🔄 Force Refresh</Button>, <Button action={`/play/${forwardAddr}`}>⬅️ Cancel</Button> ]
     })
  }

  if (isSettled) {
     return c.res({
       image: (
         <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
           <h1 style={{ fontSize: 60, color: '#00ffcc' }}>Round #{roundId} Settled!</h1>
           <p style={{ fontSize: 30, color: '#aaa' }}>Check the results for your payout.</p>
         </div>
       ),
       intents: [ <Button action={`/result/${forwardAddr}`}>📊 View Result</Button> ]
     })
  }

  if (startTime === 0) {
     return c.res({
       headers: { Refresh: '2' },
       image: (
         <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
           <h1 style={{ fontSize: 50, color: '#ffd98f' }}>Fetching Blockchain State...</h1>
           <p style={{ fontSize: 24, marginTop: 14 }}>Your transaction was submitted and is being indexed.</p>
         </div>
       ),
       intents: [ <Button action={`/waiting/${forwardAddr}`}>🔄 Refresh</Button>, <Button action={`/play/${forwardAddr}`}>⬅️ Cancel</Button> ]
     })
  }

  const now = Math.floor(Date.now() / 1000)
  const timeLeft = Math.max(0, 60 - (now - startTime))
  const elapsed = Math.max(0, now - startTime)

  return c.res({
    headers: { Refresh: timeLeft > 0 ? '1' : '3' },
    image: (
      <div style={{ alignItems: 'center', background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #16213e 100%)', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', fontFamily: 'sans-serif', color: 'white' }}>
        <h1 style={{ fontSize: 60, color: '#00ffcc', margin: 0 }}>Bet Placed!</h1>
        <p style={{ fontSize: 36, marginTop: 20 }}>Direction: {direction}</p>
        <p style={{ fontSize: 28, color: '#aaa', marginTop: 20 }}>Start Price: ${startPrice}</p>
        <p style={{ fontSize: 44, marginTop: 14, color: '#fff' }}>[ {timeLeft > 0 ? `${timeLeft}s` : 'READY'} ]</p>
        <p style={{ fontSize: 20, color: '#9ea7ff', marginTop: 6 }}>Elapsed: {elapsed}s</p>
        <p style={{ fontSize: 24, color: '#aaa', marginTop: 16 }}>{timeLeft > 0 ? 'Timer auto-refreshes every second.' : '60s complete. Waiting for automation or settle manually.'}</p>
      </div>
    ),
    intents: timeLeft > 0
      ? [ <Button action={`/waiting/${forwardAddr}`}>🔄 Refresh Timer</Button>, <Button action={`/play/${forwardAddr}`}>⬅️ Menu</Button> ]
      : [
          <Button action={`/waiting/${forwardAddr}`}>⏳ Wait Block</Button>,
          <Button.Transaction target="/settle" action={`/result/${forwardAddr}`}>⚙️ Manual Settle</Button.Transaction>,
          <Button action={`/result/${forwardAddr}`}>📊 View Result</Button>,
        ],
  })
}

app.frame('/result', async (c) => { return resultFrame(c) })
app.frame('/result/:addr', async (c) => { return resultFrame(c, c.req.param('addr')) })

async function resultFrame(c: any, explicitAddr?: string) {
  const userAddress = await getUserAddress(c, explicitAddr)
  const forwardAddr = userAddress || ''

  if (!userAddress) {
    return c.res({
      image: <div style={{ alignItems: 'center', background: '#111', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}><h1 style={{ fontSize: 56 }}>Address missing</h1></div>,
      intents: [<Button action="/play">⬅️ Back</Button>],
    })
  }

  let roundId = 0
  let startPrice = BigInt(0)
  let endPrice = BigInt(0)
  let settled = false
  let won = false
  let timeLeft = 0
  let pending = BigInt(0)

  let latestPriceStr = '--'
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
    const data = await res.json()
    latestPriceStr = parseFloat(data.price).toFixed(2)
  } catch (e) {}

  try {
    const r = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: GLOWSTICK_ABI, functionName: 'activeRounds', args: [userAddress] })
    roundId = Number(r[0])
    startPrice = r[2] as bigint
    endPrice = r[3] as bigint
    settled = Boolean(r[6])
    won = Boolean(r[7])

    if (roundId > 0 && !settled) {
      const startTime = Number(r[1])
      const now = Math.floor(Date.now() / 1000)
      timeLeft = Math.max(0, 60 - (now - startTime))
    }

    const pendingBal = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: GLOWSTICK_ABI, functionName: 'pendingWithdrawals', args: [userAddress] })
    pending = pendingBal as bigint
  } catch (e) {}

  if (roundId === 0) {
    return c.res({
      image: <div style={{ alignItems: 'center', background: '#111', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}><h1 style={{ fontSize: 56 }}>No round found</h1></div>,
      intents: [<Button action={`/play/${forwardAddr}`}>🎮 Start Bet</Button>],
    })
  }

  if (!settled) {
    if (timeLeft > 0) {
       return c.res({
         headers: { Refresh: '1' },
         image: <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}><h1 style={{ fontSize: 56 }}>[ {timeLeft}s LEFT ]</h1></div>,
         intents: [<Button action={`/waiting/${forwardAddr}`}>🔄 Refresh Timer</Button>],
       })
    }

    if (c.transactionId) {
       return c.res({
         headers: { Refresh: '2' },
         image: (
           <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
             <h1 style={{ fontSize: 50, color: '#ffd98f' }}>Verifying Settlement...</h1>
             <p style={{ fontSize: 24, marginTop: 14 }}>Transaction was mined. Waiting for blockchain nodes to sync state.</p>
           </div>
         ),
         intents: [<Button action={`/result/${forwardAddr}`}>🔄 Force Refresh</Button>],
       })
    }

    return c.res({
      image: (
        <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56 }}>[ READY TO SETTLE ]</h1>
          <p style={{ fontSize: 28, marginTop: 14 }}>Round #{roundId} is finished but not yet settled on-chain.</p>
          <p style={{ fontSize: 28, marginTop: 14, color: '#00ffcc' }}>Live Price: ${latestPriceStr}</p>
        </div>
      ),
      intents: [<Button.Transaction target="/settle" action={`/result/${forwardAddr}`}>⚙️ Settle Now</Button.Transaction>, <Button action={`/result/${forwardAddr}`}>🔄 Check Status</Button>],
    })
  }

  const startPriceNum = Number(formatUnits(startPrice, 8))
  const endPriceNum = Number(formatUnits(endPrice, 8))
  const draw = endPrice === startPrice

  return c.res({
    image: (
      <div style={{ alignItems: 'center', background: draw ? '#203040' : won ? '#003300' : '#330000', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
        <h1 style={{ fontSize: 80, margin: 0 }}>{draw ? 'DRAW' : won ? 'YOU WON!' : 'YOU LOST.'}</h1>
        <p style={{ fontSize: 34, marginTop: 16 }}>Start: ${startPriceNum.toFixed(2)} | End: ${endPriceNum.toFixed(2)}</p>
        <p style={{ fontSize: 24, marginTop: 16, color: '#d6ffd6' }}>{won ? 'Payout was processed on-chain.' : draw ? 'Stake refunded.' : 'Better luck next time.'}</p>
        <p style={{ fontSize: 20, marginTop: 10, color: '#a8c6ff' }}>Pending manual claim: {formatUnits(pending, 18)} ETH</p>
      </div>
    ),
    intents: pending > BigInt(0)
      ? [<Button.Transaction target="/claim" action={`/result/${forwardAddr}`}>💰 Withdraw Payout</Button.Transaction>, <Button action={`/play/${forwardAddr}`}>🔄 New Bet</Button>]
      : [<Button action={`/play/${forwardAddr}`}>🔄 New Bet</Button>],
  })
}

app.transaction('/faucet', (c) => {
  return c.contract({ abi: GLOWSTICK_ABI, chainId: 'eip155:11155111', functionName: 'faucet', to: CONTRACT_ADDRESS })
})

app.transaction('/bet/:direction', async (c) => {
  const isUp = c.req.param('direction') === 'up'
  let betValue = parseEther(c.inputText || '0.01')
  
  const userAddress = await getUserAddress(c) || '0x0000000000000000000000000000000000000000'
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
  const data = await res.json()
  const binancePriceBigInt = BigInt(Math.floor(parseFloat(data.price) * 1e8))
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

  const structHash = keccak256(encodePacked(['address', 'string', 'bool', 'int256', 'uint256'], [userAddress, 'BET', isUp, binancePriceBigInt, deadline]))
  const signature = await account.signMessage({ message: { raw: structHash } })

  return c.contract({ abi: GLOWSTICK_ABI, chainId: 'eip155:11155111', functionName: 'bet', args: [isUp, binancePriceBigInt, deadline, signature], to: CONTRACT_ADDRESS, value: betValue })
})

app.transaction('/settle', async (c) => {
  const userAddress = await getUserAddress(c) || '0x0000000000000000000000000000000000000000'
  
  let roundId = BigInt(0)
  try {
    const r = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: GLOWSTICK_ABI, functionName: 'activeRounds', args: [userAddress] })
    roundId = r[0] as bigint
  } catch(e) {}

  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
  const data = await res.json()
  const binancePriceBigInt = BigInt(Math.floor(parseFloat(data.price) * 1e8))
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

  const structHash = keccak256(encodePacked(['address', 'uint256', 'string', 'int256', 'uint256'], [userAddress, roundId, 'SETTLE', binancePriceBigInt, deadline]))
  const signature = await account.signMessage({ message: { raw: structHash } })

  return c.contract({ abi: GLOWSTICK_ABI, chainId: 'eip155:11155111', functionName: 'settleMyRound', args: [binancePriceBigInt, deadline, signature], to: CONTRACT_ADDRESS })
})

app.transaction('/claim', (c) => {
  return c.contract({ abi: GLOWSTICK_ABI, chainId: 'eip155:11155111', functionName: 'claim', args: [BigInt(0)], to: CONTRACT_ADDRESS })
})

devtools(app, { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
