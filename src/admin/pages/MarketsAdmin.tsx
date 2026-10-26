/**
 * Market controls — pause/unpause (PAUSE_GUARDIAN, instant), borrow fee and
 * risk parameters (RISK_ADMIN directly, or queued through the Timelock).
 * Inputs are validated with the same rules LendingPool enforces.
 */
import { useState } from 'react'
import { parseUnits } from 'viem'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { TOKENS } from '../../lib/steadfi'
import {
  useAdminMarkets, useAdminRoles, usePoolAdminWrite, useRiskChange, type AdminMarket,
} from '../useAdmin'
import { MAX_BORROW_FEE_BPS, MAX_LIQ_BONUS_BPS } from '../abi'
import { ConfirmButton, Field, Pill, fmtAmount, inputCls, useTxRunner } from '../components'

const pctToBps = (s: string) => Math.round(parseFloat(s) * 100)
const bpsToPct = (b: number) => (b / 100).toString()

export default function MarketsAdmin() {
  const { markets, loading } = useAdminMarkets()
  const roles = useAdminRoles()
  const risk = useRiskChange()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Markets</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Pause markets, set the borrow fee and tune risk parameters.{' '}
          {risk.mode === 'direct' && 'Your wallet holds RISK_ADMIN, so risk changes apply immediately.'}
          {risk.mode === 'timelock' && 'Risk changes are queued in the Timelock and applied after the delay.'}
          {risk.mode === 'none' && 'Your wallet cannot change risk parameters.'}
        </p>
      </div>
      {loading && <p className="text-sm text-[var(--color-muted-foreground)]">Loading markets…</p>}
      {markets.map(m => m.config && (
        <MarketCard
          key={`${m.symbol}-${m.config.ltv}-${m.config.liqThreshold}-${m.config.supplyCap}-${m.config.borrowCap}-${m.borrowFeeBps}`}
          market={m}
          canPause={roles.isPauseGuardian}
          riskMode={risk.mode}
          submitRisk={risk.submit}
        />
      ))}
    </div>
  )
}

function MarketCard({ market: m, canPause, riskMode, submitRisk }: {
  market: AdminMarket
  canPause: boolean
  riskMode: 'direct' | 'timelock' | 'none'
  submitRisk: ReturnType<typeof useRiskChange>['submit']
}) {
  const cfg = m.config!
  const write = usePoolAdminWrite()
  const { run, busy } = useTxRunner()
  const asset = TOKENS[m.symbol].address
  const canRisk = riskMode !== 'none'

  const [fee, setFee] = useState(m.borrowFeeBps !== null ? bpsToPct(m.borrowFeeBps) : '0')
  const [ltv, setLtv] = useState(bpsToPct(cfg.ltv))
  const [liq, setLiq] = useState(bpsToPct(cfg.liqThreshold))
  const [bonus, setBonus] = useState(bpsToPct(cfg.liqBonus))
  const [rf, setRf] = useState(bpsToPct(cfg.reserveFactor))
  const [cf, setCf] = useState(bpsToPct(cfg.closeFactor))
  const [supplyCap, setSupplyCap] = useState(fmtAmount(cfg.supplyCap, m.decimals, m.decimals).replace(/,/g, ''))
  const [borrowCap, setBorrowCap] = useState(fmtAmount(cfg.borrowCap, m.decimals, m.decimals).replace(/,/g, ''))

  // ── Fee validation ──
  const feeBps = pctToBps(fee)
  const feeError = !Number.isFinite(feeBps) || feeBps < 0
    ? 'Enter a percentage'
    : feeBps > MAX_BORROW_FEE_BPS ? `Max ${MAX_BORROW_FEE_BPS / 100}%` : null

  // ── Risk validation (mirrors LendingPool.setRiskParams) ──
  const b = { ltv: pctToBps(ltv), liq: pctToBps(liq), bonus: pctToBps(bonus), rf: pctToBps(rf), cf: pctToBps(cf) }
  let caps: { supply: bigint; borrow: bigint } | null = null
  try { caps = { supply: parseUnits(supplyCap || '0', m.decimals), borrow: parseUnits(borrowCap || '0', m.decimals) } } catch { caps = null }
  const riskError =
    Object.values(b).some(v => !Number.isFinite(v) || v < 0) ? 'All percentages must be numbers ≥ 0'
    : !caps ? 'Caps must be token amounts'
    : cfg.collateralEnabled && (b.ltv === 0 || b.liq === 0) ? 'Collateral markets need non-zero LTV and liquidation threshold'
    : cfg.collateralEnabled && b.ltv >= b.liq ? 'LTV must be below the liquidation threshold'
    : cfg.collateralEnabled && b.liq >= 10_000 ? 'Liquidation threshold must be below 100%'
    : !cfg.collateralEnabled && (b.ltv !== 0 || b.liq !== 0) ? 'Non-collateral markets must have LTV and threshold at 0'
    : b.rf >= 10_000 ? 'Reserve factor must be below 100%'
    : b.cf === 0 || b.cf > 10_000 ? 'Close factor must be between 0% and 100%'
    : b.bonus > MAX_LIQ_BONUS_BPS ? `Liquidation bonus max ${MAX_LIQ_BONUS_BPS / 100}%`
    : caps.supply === 0n ? 'A supply cap of 0 blocks all deposits'
    : null

  const actionWord = riskMode === 'timelock' ? 'Queue' : 'Apply'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{m.symbol}</h2>
          {cfg.paused ? <Pill tone="danger">Paused</Pill> : <Pill tone="success">Active</Pill>}
          {cfg.collateralEnabled && <Pill tone="muted">Collateral</Pill>}
          {cfg.borrowEnabled && <Pill tone="muted">Borrowable</Pill>}
        </div>
        <ConfirmButton
          variant={cfg.paused ? 'primary' : 'danger'}
          disabled={!canPause}
          loading={busy === 'pause'}
          onConfirm={() => void run('pause', cfg.paused ? `Unpaused ${m.symbol}` : `Paused ${m.symbol}`,
            () => write('setMarketPaused', [asset, !cfg.paused]))}
        >
          {cfg.paused ? 'Unpause market' : 'Pause market'}
        </ConfirmButton>
      </CardHeader>
      {!canPause && <p className="-mt-2 mb-3 text-[11px] text-[var(--color-muted-foreground)]">Pausing requires PAUSE_GUARDIAN.</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        {/* Fee */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Borrow (origination) fee</h3>
          {m.borrowFeeBps === null ? (
            <p className="text-xs text-[var(--color-warning)]">The deployed pool has no fee support. Redeploy to enable it.</p>
          ) : !cfg.borrowEnabled ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">Borrowing is disabled for this market, so the fee never applies.</p>
          ) : (
            <>
              <Field label="Fee (%)" hint={`One-time, added to the borrower's debt. Max ${MAX_BORROW_FEE_BPS / 100}%. Current ${(m.borrowFeeBps / 100).toFixed(2)}%.`}>
                <input className={inputCls} inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} disabled={!canRisk} />
              </Field>
              {feeError && <p className="text-xs text-[var(--color-destructive)]">{feeError}</p>}
              <Button
                size="sm"
                disabled={!canRisk || !!feeError || feeBps === m.borrowFeeBps}
                loading={busy === 'fee'}
                onClick={() => void run('fee', `Borrow fee for ${m.symbol} set to ${(feeBps / 100).toFixed(2)}%`,
                  () => submitRisk('setBorrowFee', [asset, feeBps]))}
              >
                {actionWord} fee
              </Button>
            </>
          )}
        </div>

        {/* Risk */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Risk parameters</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="LTV (%)"><input className={inputCls} value={ltv} onChange={e => setLtv(e.target.value)} disabled={!canRisk || !cfg.collateralEnabled} /></Field>
            <Field label="Liquidation threshold (%)"><input className={inputCls} value={liq} onChange={e => setLiq(e.target.value)} disabled={!canRisk || !cfg.collateralEnabled} /></Field>
            <Field label="Liquidation bonus (%)"><input className={inputCls} value={bonus} onChange={e => setBonus(e.target.value)} disabled={!canRisk} /></Field>
            <Field label="Reserve factor (%)" hint="Protocol share of interest"><input className={inputCls} value={rf} onChange={e => setRf(e.target.value)} disabled={!canRisk} /></Field>
            <Field label="Close factor (%)"><input className={inputCls} value={cf} onChange={e => setCf(e.target.value)} disabled={!canRisk} /></Field>
            <div />
            <Field label={`Supply cap (${m.symbol})`} hint={`Supplied now: ${fmtAmount(m.totalSupply, m.decimals, 4)}`}>
              <input className={inputCls} value={supplyCap} onChange={e => setSupplyCap(e.target.value)} disabled={!canRisk} />
            </Field>
            <Field label={`Borrow cap (${m.symbol})`} hint="0 = unlimited">
              <input className={inputCls} value={borrowCap} onChange={e => setBorrowCap(e.target.value)} disabled={!canRisk} />
            </Field>
          </div>
          {riskError && <p className="text-xs text-[var(--color-destructive)]">{riskError}</p>}
          <ConfirmButton
            disabled={!canRisk || !!riskError}
            loading={busy === 'risk'}
            onConfirm={() => void run('risk', `Risk parameters for ${m.symbol} updated`,
              () => submitRisk('setRiskParams', [asset, b.ltv, b.liq, b.bonus, b.rf, b.cf, caps!.supply, caps!.borrow]))}
          >
            {actionWord} risk parameters
          </ConfirmButton>
        </div>
      </div>
    </Card>
  )
}
