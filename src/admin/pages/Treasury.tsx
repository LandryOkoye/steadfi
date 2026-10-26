/**
 * Treasury — protocol revenue per market and reserve withdrawals (OWNER).
 * Reserves include borrow fees and interest still owed by borrowers, so the
 * withdrawable amount is capped by the cash actually held in the pool.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress, parseUnits } from 'viem'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { TOKENS } from '../../lib/steadfi'
import { useAdminMarkets, useAdminRoles, usePoolAdminWrite, toRay, type AdminMarket } from '../useAdmin'
import { ConfirmButton, Field, KpiTile, fmtAmount, fmtUsd, inputCls, usdOf, useTxRunner } from '../components'

export default function Treasury() {
  const { markets } = useAdminMarkets()
  const { isOwner } = useAdminRoles()
  const totalUsd = markets.reduce<number | null>((acc, m) => {
    if (acc === null || m.reserves === 0n) return acc
    const usd = usdOf(m.reserves, m.decimals, m.price18)
    return usd === null ? null : acc + usd
  }, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Treasury</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Revenue comes from the reserve factor (protocol share of interest) and the one-time borrow fee.
          {!isOwner && ' Withdrawing requires the OWNER role.'}
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total revenue accrued" value={fmtUsd(totalUsd)} tone="success" />
        {markets.filter(m => m.config?.borrowEnabled).map(m => (
          <KpiTile key={m.symbol} label={`${m.symbol} reserves`} value={fmtAmount(m.reserves, m.decimals, 4)}
            sub={`Fee ${m.borrowFeeBps === null ? '—' : (m.borrowFeeBps / 100).toFixed(2) + '%'} · reserve factor ${((m.config?.reserveFactor ?? 0) / 100).toFixed(0)}%`} />
        ))}
      </div>
      {markets.map(m => m.config && <WithdrawCard key={m.symbol} market={m} canWithdraw={isOwner} />)}
    </div>
  )
}

function WithdrawCard({ market: m, canWithdraw }: { market: AdminMarket; canWithdraw: boolean }) {
  const { address } = useAccount()
  const write = usePoolAdminWrite()
  const { run, busy } = useTxRunner()
  const [to, setTo] = useState(address ?? '')
  const [amount, setAmount] = useState('')

  const withdrawable = m.reserves < m.cash ? m.reserves : m.cash
  let amt: bigint | null = null
  try { amt = amount ? parseUnits(amount, m.decimals) : null } catch { amt = null }
  const error =
    amount && amt === null ? 'Invalid amount'
    : amt !== null && amt > withdrawable ? 'More than is withdrawable right now'
    : to && !isAddress(to) ? 'Invalid recipient address'
    : null
  const ready = canWithdraw && amt !== null && amt > 0n && !error && isAddress(to)

  return (
    <Card>
      <CardHeader><CardTitle>{m.symbol} reserves</CardTitle></CardHeader>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5 text-sm">
          <p className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Accrued</span><span className="mono">{fmtAmount(m.reserves, m.decimals)}</span></p>
          <p className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Cash in pool</span><span className="mono">{fmtAmount(m.cash, m.decimals)}</span></p>
          <p className="flex justify-between font-semibold"><span>Withdrawable now</span><span className="mono">{fmtAmount(withdrawable, m.decimals)}</span></p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] items-end">
          <Field label="Recipient (treasury)">
            <input className={inputCls} value={to} onChange={e => setTo(e.target.value.trim())} placeholder="0x…" disabled={!canWithdraw} />
          </Field>
          <Field label={`Amount (${m.symbol})`}>
            <div className="flex gap-1">
              <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={!canWithdraw} />
              <button type="button" className="text-xs px-2 text-[var(--color-primary)]" disabled={!canWithdraw}
                onClick={() => setAmount(fmtAmount(withdrawable, m.decimals, m.decimals).replace(/,/g, ''))}>MAX</button>
            </div>
          </Field>
          <ConfirmButton
            disabled={!ready}
            loading={busy === 'w'}
            onConfirm={() => void run('w', `Withdrew ${amount} ${m.symbol} of reserves`, async () => {
              const hash = await write('withdrawReserves', [TOKENS[m.symbol].address, to, toRay(amt!, m.decimals)])
              setAmount('')
              return hash
            })}
          >
            Withdraw
          </ConfirmButton>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-destructive)]">{error}</p>}
    </Card>
  )
}
