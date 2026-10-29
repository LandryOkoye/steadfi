/**
 * Supply — lend USDC/EURC to earn interest, or deposit cirBTC/WETH as
 * collateral. Approval first when the allowance is too low.
 */
import { useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import Button from '../ui/Button'
import AmountInput from '../ui/AmountInput'
import StatRow from '../ui/StatRow'
import HealthFactor from '../ui/HealthFactor'
import RiskDisclosure from '../ui/RiskDisclosure'
import {
  SYMBOLS, useApprove, useMarketData, useOraclePrices, useSupply, useTokenAllowance, useTokenBalance, useUserPosition,
} from '../../hooks/useSteadFi'
import { CONTRACTS, TOKENS, formatToken, usdFromTokenAmount } from '../../lib/steadfi'
import { ApprovalSteps, Notice, Overview, errMsg, fmtUsd, parseAmount, toastTx } from './shared'
import type { ActionFormProps } from './ActionProvider'
import { toast } from 'sonner'

export default function SupplyForm({ symbol, onDone, setBusy }: ActionFormProps) {
  const token = TOKENS[symbol]
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState<'approve' | 'supply' | null>(null)

  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const position = useUserPosition()
  const market = markets.find(m => m.symbol === symbol)
  const price18 = prices[symbol]

  const balance = useTokenBalance(symbol)
  const allowance = useTokenAllowance(symbol, CONTRACTS.LendingPool)
  const amt = parseAmount(amount, token.decimals, parseUnits) ?? 0n
  const needsApproval = amt > 0n && allowance < amt
  const overBalance = amt > balance
  const usd = price18 && amt > 0n ? usdFromTokenAmount(amt, token.decimals, price18) : null

  // HF after adding collateral (only meaningful with debt).
  const totalDebtUsd = Number(position.totalDebtRay) / 1e27
  const previewHf = (() => {
    if (!token.collateralEnabled || totalDebtUsd <= 0) return null
    const liqColl = SYMBOLS.reduce((acc, s) => {
      const p = prices[s]
      if (!p) return acc
      const m = markets.find(x => x.symbol === s)
      const bal = position.supplies[s] + (s === symbol ? amt : 0n)
      return acc + usdFromTokenAmount(bal, TOKENS[s].decimals, p) * ((m?.liqThreshold ?? 0) / 100)
    }, 0)
    return liqColl / totalDebtUsd
  })()

  async function run(kind: 'approve' | 'supply', fn: () => Promise<void>) {
    setPending(kind); setBusy(true)
    try { await fn() } catch (e) { toast.error(kind === 'approve' ? 'Approval failed' : 'Supply failed', { description: errMsg(e) }) }
    finally { setPending(null); setBusy(false) }
  }
  const approve = useApprove()
  const { supply } = useSupply()

  return (
    <div>
      <AmountInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={symbol}
        max={formatUnits(balance, token.decimals)}
        balanceLabel="Wallet balance"
        balance={formatToken(balance, token.decimals)}
        usdEquiv={usd !== null ? usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined}
        invalid={overBalance}
        id="supply-amount"
      />
      {overBalance && <Notice tone="danger">Amount exceeds your wallet balance.</Notice>}

      <Overview>
        {token.collateralEnabled ? (
          <>
            <StatRow label="Used as collateral" value={<span className="text-[var(--color-success)] font-medium">Yes</span>} />
            <StatRow label="Max LTV" mono value={market ? `${market.ltv.toFixed(0)}%` : '—'} />
            {previewHf !== null && position.healthFactor !== null && (
              <StatRow label="Health factor" value={<HealthFactor value={position.healthFactor} preview={previewHf} size="sm" bare />} />
            )}
          </>
        ) : (
          <>
            <StatRow label="Supply APY" mono value={<span className="text-[var(--color-success)]">{(market?.supplyApy ?? 0).toFixed(2)}%</span>} />
            <StatRow label="Used as collateral" value={<span className="text-[var(--color-muted-foreground)]">No · earns interest only</span>} />
            {usd !== null && (
              <StatRow label="Est. yearly earnings" mono value={`+${fmtUsd(usd * ((market?.supplyApy ?? 0) / 100))}`} />
            )}
          </>
        )}
      </Overview>

      {needsApproval && <ApprovalSteps approved={false} action="Supply" />}

      <div className="mt-5 space-y-2">
        {needsApproval ? (
          <Button
            variant="primary" size="lg" className="w-full"
            loading={pending === 'approve'} disabled={overBalance}
            onClick={() => void run('approve', async () => {
              await approve(symbol, CONTRACTS.LendingPool)
              toast.success(`${symbol} approved`)
            })}
          >
            Approve {symbol}
          </Button>
        ) : (
          <Button
            variant="primary" size="lg" className="w-full"
            loading={pending === 'supply'} disabled={amt === 0n || overBalance}
            onClick={() => void run('supply', async () => {
              const hash = await supply(symbol, amt)
              toastTx(`Supplied ${amount} ${symbol}`, hash)
              onDone()
            })}
          >
            {amt === 0n ? 'Enter an amount' : `Supply ${symbol}`}
          </Button>
        )}
      </div>
      {/*<div className="mt-4"><RiskDisclosure includesBridge={token.collateralEnabled} /></div>*/}
    </div>
  )
}
