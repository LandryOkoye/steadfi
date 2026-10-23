/**
 * Supply — supply USDC/EURC to earn interest, or cirBTC/WETH as collateral.
 * All data is live from LendingPool + the on-chain Pyth oracle.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { toast } from 'sonner'
import { parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import {
  SYMBOLS, useTokenBalance, useTokenAllowance, useApprove, useSupply,
  useMarketData, useOraclePrices,
} from '../hooks/useSteadFi'
import { CONTRACTS, TOKENS, TokenSymbol, formatToken, txUrl, usdFromTokenAmount } from '../lib/steadfi'

export default function Supply() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const market = markets.find(m => m.symbol === asset)
  const token = TOKENS[asset]
  const price18 = prices[asset]

  const balanceRaw = useTokenBalance(asset)
  const balanceFormatted = formatToken(balanceRaw, token.decimals)
  const allowance = useTokenAllowance(asset, CONTRACTS.LendingPool)
  const numAmount = parseFloat(amount) || 0
  const amountBig = amount ? parseUnits(amount, token.decimals) : 0n
  const needsApproval = allowance < amountBig

  const usdValue = price18 && amountBig > 0n
    ? usdFromTokenAmount(amountBig, token.decimals, price18)
    : null
  const estYearlyEarnings = usdValue !== null
    ? usdValue * ((market?.supplyApy ?? 0) / 100)
    : null

  const approve = useApprove()
  const { supply } = useSupply()

  async function handleApprove() {
    setBusy(true)
    try {
      const hash = await approve(asset, CONTRACTS.LendingPool)
      toast.success('Approval confirmed', { description: hash })
    } catch (e: unknown) {
      toast.error('Approval failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function handleSupply() {
    if (!numAmount || !amountBig) return
    setBusy(true)
    try {
      const hash = await supply(asset, amountBig)
      toast.success(`Supplied ${amount} ${asset}`, {
        description: (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer"
             className="underline text-xs">View on explorer</a>
        ),
      })
      setAmount('')
    } catch (e: unknown) {
      toast.error('Supply failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Supply</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Earn interest on USDC/EURC, or deposit cirBTC/WETH as collateral to unlock borrowing.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Select asset</CardTitle></CardHeader>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {SYMBOLS.map(sym => (
            <button
              key={sym}
              onClick={() => { setAsset(sym); setAmount('') }}
              className={`py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                ${asset === sym
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {sym}
              {TOKENS[sym].collateralEnabled && (
                <span className="ml-1 text-[10px] text-[var(--color-accent)]">collateral</span>
              )}
            </button>
          ))}
        </div>

        <AmountInput
          label={`Amount of ${asset} to supply`}
          value={amount}
          onChange={setAmount}
          max={balanceFormatted.replace(/,/g, '')}
          symbol={asset}
          usdEquiv={usdValue !== null ? usdValue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="supply-amount"
        />

        <div className="mt-5 space-y-0">
          {token.collateralEnabled ? (
            <StatRow
              label="Collateral value"
              value={
                usdValue === null
                  ? <span className="text-xs text-[var(--color-warning)]">Price unavailable</span>
                  : <span className="text-[var(--color-accent)] mono">${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              }
            />
          ) : (
            <StatRow
              label="Supply APY"
              value={
                market?.loading
                  ? <span className="text-[var(--color-muted-foreground)] text-xs">loading…</span>
                  : <span className="text-[var(--color-success)] mono">{market?.supplyApy.toFixed(2)}%</span>
              }
            />
          )}
          <StatRow
            label="Wallet balance"
            value={<span className="mono">{balanceFormatted} {asset}</span>}
          />
          {!token.collateralEnabled && estYearlyEarnings !== null && (
            <StatRow
              label="Est. yearly earnings"
              value={<span className="text-[var(--color-success)] mono">+${estYearlyEarnings.toFixed(2)}</span>}
            />
          )}
        </div>

        {isConnected ? (
          <div className="mt-5 space-y-2">
            {needsApproval && amountBig > 0n && (
              <Button
                variant="secondary"
                className="w-full"
                loading={busy}
                onClick={() => { void handleApprove() }}
              >
                Approve {asset}
              </Button>
            )}
            <Button
              variant="primary"
              className="w-full"
              loading={busy}
              disabled={!numAmount || needsApproval || balanceRaw === 0n}
              onClick={() => { void handleSupply() }}
            >
              Supply {asset}
            </Button>
          </div>
        ) : (
          <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
            Connect your wallet to supply
          </p>
        )}
      </Card>

      <RiskDisclosure />
    </div>
  )
}
