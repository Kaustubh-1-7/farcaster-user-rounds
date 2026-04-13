/** @jsxImportSource frog/jsx */

import { Button, Frog, TextInput } from 'frog'
import { devtools } from 'frog/dev'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'
import { createPublicClient, formatUnits, http, parseEther } from 'viem'
import { sepolia } from 'viem/chains'

const CONTRACT_ADDRESS = '0x0e04CB3a3DdABf7dB4BEbe394a9be79d5aaCa5B5'

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
  let roundId = 0
  let timeLeft = 0
  let isSettled = false
  let direction = 'UP'
  let amountEth = '0'
  let startTime = 0
  let startPrice = '--'

  try {
    const lp = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'getLatestPrice',
    })
    latestPrice = formatUnits(lp, 8)
  } catch (e) {
    console.error('Error reading latest price:', e)
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
    } catch (e) {
      console.error('Error reading user round:', e)
    }
  }

  const hasActive = roundId > 0 && !isSettled
  const nowTs = Math.floor(Date.now() / 1000)
  const waitDirection = direction.toLowerCase()

  const intents = hasActive
    ? timeLeft > 0
      ? [
          <Button action={`/waiting/${waitDirection}/${startTime}/${startPrice}`}>🔄 Check Timer</Button>,
          <Button action={`/result/dev/${waitDirection}/${startTime}/${startPrice}`}>📊 View Result</Button>,
        ]
      : [
          <Button.Transaction target="/settle" action={`/result/dev/${waitDirection}/${startTime}/${startPrice}`}>⚙️ Settle My Round</Button.Transaction>,
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
        {hasActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, alignItems: 'center' }}>
            <p style={{ fontSize: 30, margin: 0 }}>Round #{roundId} ({direction})</p>
            <p style={{ fontSize: 24, color: '#aaa', marginTop: 8 }}>Stake: {amountEth} ETH</p>
            <p style={{ fontSize: 40, marginTop: 14 }}>[ {timeLeft > 0 ? `${timeLeft}s` : 'READY TO SETTLE'} ]</p>
          </div>
        ) : (
          <p style={{ fontSize: 24, color: '#aaa', marginTop: 22 }}>
            Predict if price goes up or down in the next 60 seconds.
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
        <p style={{ fontSize: 24, color: '#aaa', marginTop: 16 }}>
          {timeLeft > 0 ? 'Timer auto-refreshes every second.' : '60s complete. View result or settle on-chain.'}
        </p>
      </div>
    ),
    intents: timeLeft > 0
      ? [
          <Button action={`/waiting/${direction.toLowerCase()}/${startTs}/${startPrice}`}>🔄 Check Timer</Button>,
          <Button action={`/result/dev/${direction.toLowerCase()}/${startTs}/${startPrice}`}>📊 View Result</Button>,
        ]
      : [
          <Button.Transaction target="/settle" action={`/result/dev/${direction.toLowerCase()}/${startTs}/${startPrice}`}>⚙️ Settle My Round</Button.Transaction>,
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

  let latest = '--'
  let latestNum = Number.NaN
  try {
    const lp = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: GLOWSTICK_ABI,
      functionName: 'getLatestPrice',
    })
    latest = formatUnits(lp, 8)
    latestNum = Number(latest)
  } catch (e) {
    console.error('Error reading latest price for dev result:', e)
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
        <Button action={`/waiting/${direction}/${startTs}/${startPriceRaw}`}>🔄 Back To Timer</Button>,
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
        <p style={{ fontSize: 22, marginTop: 16, color: '#d6ffd6' }}>
          DevTools preview mode result. Use Settle My Round for on-chain finalization.
        </p>
      </div>
    ),
    intents: [
      <Button.Transaction target="/settle" action={`/result/dev/${direction}/${startTs}/${startPriceRaw}`}>⚙️ Settle On-Chain</Button.Transaction>,
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
