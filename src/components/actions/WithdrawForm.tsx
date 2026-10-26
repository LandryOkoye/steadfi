/**
 * Withdraw — take supplied assets back. For collateral with open debt, MAX is
 * the most that keeps borrow power above the debt (the contract's LTV check).
 */
import { useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import Button from '../ui/Button'
import AmountInput from '../ui/AmountInput'
import StatRow from '../ui/StatRow'
import HealthFactor from '../ui/HealthFactor'
import { SYMBOLS, useMarketData, useOraclePrices, useUserPosition, useWithdraw } from '../../hooks/useSteadFi'
import { TOKENS, formatToken, usdFromTokenAmount } from '../../lib/steadfi'
import { Notice, Overview, errMsg, parseAmount, toastTx } from './shared'
import type { ActionFormProps } from './ActionProvider'

export default function WithdrawForm({ symbol, onDone, setBusy }: ActionFormProps) {
  const token = TOKENS[symbol]
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const market = markets.find(m => m.symbol === symbol)
  const price18 = prices[symbol]
  const supplied = position.supplies[symbol]

  const amt = parseAmount(amount, token.decimals, parseUnits) ?? 0n
  const usd = price18 ? usdFromTokenAmount(amt, token.decimals, price18) : 0

  const totalDebtUsd = Number(position.totalDebtRay) / 1e27
  const borrowPowerUsd = Number(position.borrowPowerRay) / 1e27

  // Most collateral that can leave while borrow power still covers the debt.
  let maxWithdraw = supplied
  if (token.collateralEnabled && totalDebtUsd > 0 && price18 && market && market.ltv > 0) {
    const spareUsd = Math.max(borrowPowerUsd - totalDebtUsd, 0) * 0.995 // small buffer for interest/price drift
    const spareTokens = spareUsd / (market.ltv / 100) / (Number(price18) / 1e18)
    const spareUnits = BigInt(Math.floor(spareTokens * 10 ** token.decimals))
    if (spareUnits < maxWithdraw) maxWithdraw = spareUnits
  }

  const powerLost = token.collateralEnabled && market ? usd * (market.ltv / 100) : 0
  const exceedsPower = totalDebtUsd > 0 && borrowPowerUsd - powerLost < totalDebtUsd
  const exceedsSupplied = amt > supplied
  const exceedsLiquidity = market?.liquidityUsd !== null && market?.liquidityUsd !== undefined && usd > market.liquidityUsd + 1e-9

  const previewHf = (() => {
    if (!token.collateralEnabled || totalDebtUsd <= 0 || amt === 0n) return null
    const liqColl = SYMBOLS.reduce((acc, s) => {
      const p = prices[s]
      if (!p) return acc
      const m = markets.find(x => x.symbol === s)
      const bal = s === symbol ? (supplied > amt ? supplied - amt : 0n) : position.supplies[s]
      return acc + usdFromTokenAmount(bal, TOKENS[s].decimals, p) * ((m?.liqThreshold ?? 0) / 100)
    }, 0)
    return liqColl / totalDebtUsd
  })()

  const { withdraw } = useWithdraw()
  const blocked = amt === 0n || exceedsSupplied || exceedsPower || exceedsLiquidity || !price18

  async function submit() {
    setPending(true); setBusy(true)
    try {
      const hash = await withdraw(symbol, amt)
      toastTx(`Withdrew ${amount} ${symbol}`, hash)
      onDone()
    } catch (e) {
      toast.error('Withdraw failed', { description: errMsg(e) })
    } finally {
      setPending(false); setBusy(false)
    }
  }

  return (
    <div>
      <AmountInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={symbol}
        max={formatUnits(maxWithdraw, token.decimals)}
        balanceLabel={maxWithdraw < supplied ? 'Withdrawable' : 'Supplied'}
        balance={formatToken(maxWithdraw, token.decimals)}
        usdEquiv={price18 && amt > 0n ? usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined}
        invalid={exceedsSupplied || exceedsPower}
        id="withdraw-amount"
      />
      {exceedsSupplied && <Notice tone="danger">You have {formatToken(supplied, token.decimals)} {symbol} supplied.</Notice>}
      {!exceedsSupplied && exceedsPower && <Notice tone="danger">This would leave your debt above your borrow power. Repay first or withdraw less.</Notice>}
      {exceedsLiquidity && <Notice tone="warning">Not enough {symbol} in the pool right now. Try a smaller amount.</Notice>}
      {!price18 && <Notice tone="warning">The {symbol} price is temporarily unavailable, so withdrawals are paused.</Notice>}

      <Overview>
        <StatRow label="Remaining supply" mono value={`${formatToken(supplied > amt ? supplied - amt : 0n, token.decimals)} ${symbol}`} />
        {!token.collateralEnabled && market && (
          <StatRow label="Supply APY" mono value={<span className="text-[var(--color-success)]">{market.supplyApy.toFixed(2)}%</span>} />
        )}
        {previewHf !== null && position.healthFactor !== null && (
          <StatRow label="Health factor" value={<HealthFactor value={position.healthFactor} preview={previewHf} size="sm" bare />} />
        )}
      </Overview>

      <Button variant="primary" size="lg" className="w-full mt-5" loading={pending} disabled={blocked} onClick={() => void submit()}>
        {amt === 0n ? 'Enter an amount' : `Withdraw ${symbol}`}
      </Button>
    </div>
  )
}
