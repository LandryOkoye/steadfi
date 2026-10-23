/**
 * Supply — supply USDC or EURC to earn interest.
 * All data is live from LendingPool. No mocks.
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
  useTokenBalance, useTokenAllowance, useApprove, useSupply, useMarketData,
} from '../hooks/useSteadFi'
import { CONTRACTS, BORROW_TOKENS, TokenSymbol, formatToken, txUrl } from '../lib/steadfi'

export default function Supply() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const markets = useMarketData()
  const market = markets.find(m => m.symbol === asset)

  // Live wallet balance
  const balanceRaw = useTokenBalance(asset)
  const decimals = asset === 'USDC' || asset === 'EURC' ? 6 : 18
  const balanceFormatted = formatToken(balanceRaw, decimals)

  // Allowance check
  const allowance = useTokenAllowance(asset, CONTRACTS.LendingPool)
  const numAmount = parseFloat(amount) || 0
  const amountBig = amount ? parseUnits(amount, decimals) : 0n
  const needsApproval = allowance < amountBig

  const approve = useApprove()
  const { supply } = useSupply()

  const estYearlyEarnings = numAmount * ((market?.supplyApy ?? 0) / 100)

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
          Earn interest on your USDC or EURC. Withdraw any time when liquidity is available.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Select asset</CardTitle></CardHeader>

        <div className="flex gap-2 mb-5">
          {BORROW_TOKENS.map(sym => (
            <button
              key={sym}
              onClick={() => { setAsset(sym); setAmount('') }}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                ${asset === sym
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <AmountInput
          label="Amount to supply"
          value={amount}
          onChange={setAmount}
          max={balanceFormatted.replace(/,/g, '')}
          symbol={asset}
          usdEquiv={numAmount > 0 ? numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="supply-amount"
        />

        <div className="mt-5 space-y-0">
          <StatRow
            label="Supply APY"
            value={
              market?.loading
                ? <span className="text-[var(--color-muted-foreground)] text-xs">loading…</span>
                : <span className="text-[var(--color-success)] mono">{(market?.supplyApy ?? 0).toFixed(2)}%</span>
            }
          />
          <StatRow
            label="Wallet balance"
            value={<span className="mono">{balanceFormatted} {asset}</span>}
          />
          {numAmount > 0 && (
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
              disabled={!numAmount || needsApproval}
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
