/** @jsxImportSource frog/jsx */

import { Button, Frog, TextInput } from 'frog'
import { devtools } from 'frog/dev'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'
import { createPublicClient, formatUnits, http, parseEther } from 'viem'
import { sepolia } from 'viem/chains'

const CONTRACT_ADDRESS = '0xa6311F2973528bE6F076f90aD514c19b77453444'

const GLOWSTICK_ABI = [
  {
    type: 'function',
    name: 'bet',
    inputs: [{ name: '_isUp', type: 'bool' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'settleMyRound',
    inputs: [],
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
    name: 'getLatestPrice',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
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

function getUserAddress(c: unknown): `0x${string}` | undefined {
  const addr = (c as { address?: string }).address
  if (addr && addr.startsWith('0x')) {
    return addr as `0x${string}`
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
      <Button.Transaction target="/faucet">💧 Get Test ETH</Button.Transaction>,
    ],
  })
})

app.frame('/start', (c) => {
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
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <h1 style={{ fontSize: 72, margin: 0, color: '#00ffcc' }}>GlowStick Bomb</h1>
        <p style={{ fontSize: 34, marginTop: 14 }}>Start your personal 60s round</p>
      </div>
    ),
    intents: [<Button action="/play">🎮 Play Now</Button>],
  })
})

app.frame('/play', async (c) => {
  const userAddress = getUserAddress(c)

  let latestPrice = '--'
  let vaultEth = '--'
  let autoQueue = '0'
  let roundId = 0
  let timeLeft = 0
  let isSettled = false
  let direction = 'UP'
  let amountEth = '0'
  let startTime = 0
  let startPrice = '--'
  let pendingEth = '0'

  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
    const data = await res.json()
    latestPrice = parseFloat(data.price).toFixed(2)
  } catch (e) {
    console.error('Error fetching Binance price:', e)
    try {
      const lp = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'getLatestPrice',
      })
      latestPrice = formatUnits(lp, 8)
    } catch(err) {}
  }

  try {
    const vb = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'getVaultBalance',
    })
    vaultEth = formatUnits(vb, 18)
  } catch (e) {
    console.error('Error reading vault balance:', e)
  }

  try {
    const au = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'activeUsersCount',
    })
    autoQueue = au.toString()
  } catch (e) {
    console.error('Error reading active users count:', e)
  }

  if (userAddress) {
    try {
      const r = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'activeRounds',
        args: [userAddress],
      })

      roundId = Number(r[0])
      isSettled = Boolean(r[6])
      direction = Boolean(r[5]) ? 'UP' : 'DOWN'
      amountEth = formatUnits(r[4], 18)
      startPrice = formatUnits(r[2], 8)

      if (roundId > 0 && !isSettled) {
        startTime = Number(r[1])
        const now = Math.floor(Date.now() / 1000)
        timeLeft = Math.max(0, 60 - (now - startTime))
      }

      const pending = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'pendingWithdrawals',
        args: [userAddress],
      })
      pendingEth = formatUnits(pending, 18)
    } catch (e) {
      console.error('Error reading user round:', e)
    }
  }

  const hasActive = roundId > 0 && !isSettled
  const nowTs = Math.floor(Date.now() / 1000)
  const waitDirection = direction.toLowerCase()
  const automationDelayHint = 'Automation may take ~10-60s after timer ends on Sepolia.'

  const intents = hasActive
    ? timeLeft > 0
      ? [
          <Button action={`/waiting/${waitDirection}/${startTime}/${startPrice}`}>⏱ Live Timer</Button>,
          <Button action={`/result/dev/${waitDirection}/${startTime}/${startPrice}`}>📊 View Result</Button>,
        ]
      : [
          <Button action={`/waiting/${waitDirection}/${startTime}/${startPrice}`}>⏳ Wait Automation</Button>,
          <Button.Transaction target="/settle" action={`/result/dev/${waitDirection}/${startTime}/${startPrice}`}>⚙️ Manual Settle</Button.Transaction>,
          <Button action={`/result/dev/${waitDirection}/${startTime}/${startPrice}`}>📊 View Result</Button>,
        ]
    : [
        <TextInput placeholder="Stake Amount (e.g., 0.01)" />,
        <Button.Transaction target="/bet/up" action={`/waiting/up/${nowTs}/${latestPrice}`}>📈 UP</Button.Transaction>,
        <Button.Transaction target="/bet/down" action={`/waiting/down/${nowTs}/${latestPrice}`}>📉 DOWN</Button.Transaction>,
      ]

  return c.res({
    image: (
      <div
        style={{
          alignItems: 'center',
          background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #16213e 100%)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          width: '100%',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        <h1 style={{ fontSize: 58, color: '#e94560', margin: 0 }}>Place Your Bet!</h1>
        <p style={{ fontSize: 30, color: '#00ffcc', marginTop: 10, marginBottom: 0 }}>
          Current Price: ${latestPrice}
        </p>
        <p style={{ fontSize: 20, color: '#d5d8ff', marginTop: 8, marginBottom: 0 }}>
          Vault: {vaultEth} ETH | Automation Queue: {autoQueue}
        </p>
        <p style={{ fontSize: 18, color: '#aaa', marginTop: 6, marginBottom: 0 }}>
          Pending Payout: {pendingEth} ETH
        </p>
        {hasActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, alignItems: 'center' }}>
            <p style={{ fontSize: 30, margin: 0 }}>Round #{roundId} ({direction})</p>
            <p style={{ fontSize: 24, color: '#aaa', marginTop: 8 }}>Stake: {amountEth} ETH</p>
            <p style={{ fontSize: 40, marginTop: 14 }}>[ {timeLeft > 0 ? `${timeLeft}s` : 'READY TO SETTLE'} ]</p>
            {timeLeft === 0 ? (
              <p style={{ fontSize: 18, color: '#ffd98f', marginTop: 8 }}>{automationDelayHint}</p>
            ) : null}
          </div>
        ) : (
          <p style={{ fontSize: 24, color: '#aaa', marginTop: 22 }}>
            Predict if price goes up or down in the next 60 seconds. If your previous round already matured, a new bet auto-settles it.
          </p>
        )}
      </div>
    ),
    intents,
  })
})

app.frame('/waiting/:direction/:startTs/:startPrice', (c) => {
  const direction = c.req.param('direction').toUpperCase()
  const startTs = Number(c.req.param('startTs'))
  const startPrice = c.req.param('startPrice')
  const now = Math.floor(Date.now() / 1000)
  const timeLeft = Number.isFinite(startTs) ? Math.max(0, 60 - (now - startTs)) : 0
  const elapsed = Number.isFinite(startTs) ? Math.max(0, now - startTs) : 0

  return c.res({
    headers: {
      Refresh: timeLeft > 0 ? '1' : '3',
    },
    image: (
      <div
        style={{
          alignItems: 'center',
          background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #16213e 100%)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          width: '100%',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        <h1 style={{ fontSize: 60, color: '#00ffcc', margin: 0 }}>Bet Placed!</h1>
        <p style={{ fontSize: 36, marginTop: 20 }}>Direction: {direction}</p>
        <p style={{ fontSize: 28, color: '#aaa', marginTop: 20 }}>Start Price: ${startPrice}</p>
        <p style={{ fontSize: 44, marginTop: 14, color: '#fff' }}>[ {timeLeft > 0 ? `${timeLeft}s` : 'READY'} ]</p>
        <p style={{ fontSize: 20, color: '#9ea7ff', marginTop: 6 }}>Elapsed: {elapsed}s</p>
        <p style={{ fontSize: 24, color: '#aaa', marginTop: 16 }}>
          {timeLeft > 0 ? 'Timer auto-refreshes every second.' : '60s complete. Waiting for automation (usually 10-60s) or settle manually.'}
        </p>
      </div>
    ),
    intents: timeLeft > 0
      ? [
          <Button action={`/waiting/${direction.toLowerCase()}/${startTs}/${startPrice}`}>⏱ Live Timer</Button>,
          <Button action={`/result/dev/${direction.toLowerCase()}/${startTs}/${startPrice}`}>📊 View Result</Button>,
        ]
      : [
          <Button action={`/waiting/${direction.toLowerCase()}/${startTs}/${startPrice}`}>⏳ Wait Automation</Button>,
          <Button.Transaction target="/settle" action={`/result/dev/${direction.toLowerCase()}/${startTs}/${startPrice}`}>⚙️ Manual Settle</Button.Transaction>,
          <Button action={`/result/dev/${direction.toLowerCase()}/${startTs}/${startPrice}`}>📊 View Result</Button>,
        ],
  })
})

app.frame('/result/dev/:direction/:startTs/:startPrice', async (c) => {
  const direction = c.req.param('direction')
  const startTs = Number(c.req.param('startTs'))
  const startPriceRaw = c.req.param('startPrice')
  const startPriceNum = Number(startPriceRaw)
  const now = Math.floor(Date.now() / 1000)
  const timeLeft = Number.isFinite(startTs) ? Math.max(0, 60 - (now - startTs)) : 0
  const userAddress = getUserAddress(c)

  let settledOnChain: boolean | null = null
  let settledRoundId = 0
  let pendingEth = '0'

  let latest = '--'
  let latestNum = Number.NaN
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT')
    const data = await res.json()
    latest = parseFloat(data.price).toFixed(2)
    latestNum = Number(latest)
  } catch (e) {
    console.error('Error reading latest price from Binance:', e)
    try {
      const lp = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'getLatestPrice',
      })
      latest = formatUnits(lp, 8)
      latestNum = Number(latest)
    } catch(err) {}
  }

  if (userAddress) {
    try {
      const r = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'activeRounds',
        args: [userAddress],
      })
      settledRoundId = Number(r[0])
      settledOnChain = Boolean(r[6])

      const pending = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: GLOWSTICK_ABI,
        functionName: 'pendingWithdrawals',
        args: [userAddress],
      })
      pendingEth = formatUnits(pending, 18)
    } catch (e) {
      console.error('Error checking on-chain settlement for dev result:', e)
    }
  }

  if (timeLeft > 0) {
    return c.res({
      headers: {
        Refresh: '1',
      },
      image: (
        <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56 }}>[ {timeLeft}s LEFT ]</h1>
          <p style={{ fontSize: 28, marginTop: 14 }}>Waiting for 60-second window to finish...</p>
        </div>
      ),
      intents: [
        <Button action={`/waiting/${direction}/${startTs}/${startPriceRaw}`}>⏱ Live Timer</Button>,
        <Button action={`/result/dev/${direction}/${startTs}/${startPriceRaw}`}>📊 Refresh Result</Button>,
      ],
    })
  }

  const validPrices = Number.isFinite(startPriceNum) && Number.isFinite(latestNum)
  const movedUp = validPrices ? latestNum > startPriceNum : false
  const draw = validPrices ? latestNum === startPriceNum : false
  const won = draw ? false : direction === 'up' ? movedUp : !movedUp

  return c.res({
    image: (
      <div style={{ alignItems: 'center', background: draw ? '#203040' : won ? '#003300' : '#330000', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
        <h1 style={{ fontSize: 80, margin: 0 }}>{draw ? 'DRAW' : won ? 'YOU WON!' : 'YOU LOST.'}</h1>
        <p style={{ fontSize: 32, marginTop: 16 }}>Start: ${startPriceRaw} | Now: ${latest}</p>
        {settledOnChain === true ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 16 }}>
            <p style={{ fontSize: 22, margin: 0, color: '#a8ffcb' }}>
              On-chain settlement confirmed for your wallet (round #{settledRoundId}).
            </p>
            <p style={{ fontSize: 20, marginTop: 8, color: '#ffd98f' }}>
              Queued payout: {pendingEth} ETH
            </p>
          </div>
        ) : settledOnChain === false ? (
          <p style={{ fontSize: 22, marginTop: 16, color: '#ffd98f' }}>
            Not settled on-chain yet. Wait for automation or use Manual Settle.
          </p>
        ) : (
          <p style={{ fontSize: 22, marginTop: 16, color: '#d6ffd6' }}>
            DevTools preview only (no wallet context). On-chain settlement cannot be verified here.
          </p>
        )}
      </div>
    ),
    intents: settledOnChain === true
      ? pendingEth !== '0'
        ? [
            <Button.Transaction target="/claim" action={`/result/dev/${direction}/${startTs}/${startPriceRaw}`}>💰 Withdraw Queued Payout</Button.Transaction>,
            <Button action="/result">✅ Open On-Chain Result</Button>,
            <Button action="/play">🔄 New Bet</Button>,
          ]
        : [
            <Button action="/result">✅ Open On-Chain Result</Button>,
            <Button action="/play">🔄 New Bet</Button>,
          ]
      : [
          <Button.Transaction target="/settle" action={`/result/dev/${direction}/${startTs}/${startPriceRaw}`}>⚙️ Settle On-Chain</Button.Transaction>,
          <Button action="/result">🔎 Open On-Chain Result</Button>,
          <Button action="/play">🔄 New Bet</Button>,
        ],
  })
})

app.frame('/result', async (c) => {
  const userAddress = getUserAddress(c)
  if (!userAddress) {
    return c.res({
      image: (
        <div style={{ alignItems: 'center', background: '#111', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56 }}>Connect a wallet in frame context</h1>
          <p style={{ fontSize: 28, color: '#aaa' }}>Then return to Play.</p>
        </div>
      ),
      intents: [<Button action="/play">⬅️ Back to Play</Button>],
    })
  }

  let roundId = 0
  let startPrice = BigInt(0)
  let endPrice = BigInt(0)
  let settled = false
  let won = false
  let timeLeft = 0
  let pending = BigInt(0)
  let vault = BigInt(0)

  try {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'activeRounds',
      args: [userAddress],
    })

    roundId = Number(r[0])
    startPrice = r[2]
    endPrice = r[3]
    settled = Boolean(r[6])
    won = Boolean(r[7])

    if (roundId > 0 && !settled) {
      const startTime = Number(r[1])
      const now = Math.floor(Date.now() / 1000)
      timeLeft = Math.max(0, 60 - (now - startTime))
    }

    pending = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'pendingWithdrawals',
      args: [userAddress],
    })

    vault = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'getVaultBalance',
    })
  } catch (e) {
    console.error('Error loading result:', e)
  }

  if (roundId === 0) {
    return c.res({
      image: (
        <div style={{ alignItems: 'center', background: '#111', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56 }}>No round found</h1>
          <p style={{ fontSize: 28, color: '#aaa' }}>Place a new bet first.</p>
        </div>
      ),
      intents: [<Button action="/play">🎮 Start Bet</Button>],
    })
  }

  if (!settled) {
    return c.res({
      image: (
        <div style={{ alignItems: 'center', background: '#1a1a2e', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
          <h1 style={{ fontSize: 56 }}>{timeLeft > 0 ? `[ ${timeLeft}s LEFT ]` : '[ READY ]'}</h1>
          <p style={{ fontSize: 28, marginTop: 14 }}>Round #{roundId} is not settled yet.</p>
        </div>
      ),
      intents: timeLeft > 0
        ? [<Button action="/result">🔄 Refresh</Button>, <Button action="/play">⬅️ Back</Button>]
        : [<Button.Transaction target="/settle" action="/result">⚙️ Settle Now</Button.Transaction>, <Button action="/result">🔄 Refresh</Button>],
    })
  }

  const draw = endPrice === startPrice

  return c.res({
    image: (
      <div style={{ alignItems: 'center', background: draw ? '#203040' : won ? '#003300' : '#330000', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%', color: 'white' }}>
        <h1 style={{ fontSize: 80, margin: 0 }}>{draw ? 'DRAW' : won ? 'YOU WON!' : 'YOU LOST.'}</h1>
        <p style={{ fontSize: 34, marginTop: 16 }}>
          Start: ${formatUnits(startPrice, 8)} | End: ${formatUnits(endPrice, 8)}
        </p>
        <p style={{ fontSize: 24, marginTop: 16, color: '#d6ffd6' }}>
          {won ? 'Payout is auto-sent.' : draw ? 'Stake refunded automatically.' : 'Round settled on-chain.'}
        </p>
        <p style={{ fontSize: 20, marginTop: 10, color: '#a8c6ff' }}>
          Vault Balance: {formatUnits(vault, 18)} ETH | Pending: {formatUnits(pending, 18)} ETH
        </p>
      </div>
    ),
    intents: pending > BigInt(0)
      ? [<Button.Transaction target="/claim" action="/result">💰 Withdraw Queued Payout</Button.Transaction>, <Button action="/play">🔄 New Bet</Button>]
      : [<Button action="/play">🔄 New Bet</Button>],
  })
})

app.transaction('/faucet', (c) => {
  return c.contract({
    abi: GLOWSTICK_ABI,
    chainId: 'eip155:11155111',
    functionName: 'faucet',
    to: CONTRACT_ADDRESS,
  })
})

app.transaction('/bet/:direction', (c) => {
  const isUp = c.req.param('direction') === 'up'

  const inputText = c.inputText || '0.01'
  let betValue = BigInt(0)
  try {
    betValue = parseEther(inputText)
  } catch (e) {
    betValue = parseEther('0.01')
  }

  return c.contract({
    abi: GLOWSTICK_ABI,
    chainId: 'eip155:11155111',
    functionName: 'bet',
    args: [isUp],
    to: CONTRACT_ADDRESS,
    value: betValue,
  })
})

app.transaction('/settle', (c) => {
  return c.contract({
    abi: GLOWSTICK_ABI,
    chainId: 'eip155:11155111',
    functionName: 'settleMyRound',
    to: CONTRACT_ADDRESS,
  })
})

app.transaction('/claim', (c) => {
  return c.contract({
    abi: GLOWSTICK_ABI,
    chainId: 'eip155:11155111',
    functionName: 'claim',
    args: [BigInt(0)],
    to: CONTRACT_ADDRESS,
  })
})

devtools(app, { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
