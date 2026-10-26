/**
 * Timelock — queued risk changes with execute (after eta) and cancel.
 * Queuing happens from the Markets tab when the wallet is the Timelock admin.
 */
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { useAdminRoles, useTimelockAction, useTimelockInfo, useTimelockQueue } from '../useAdmin'
import { TIMELOCK_GRACE_PERIOD_S } from '../abi'
import { ConfirmButton, Pill, shortAddr, useTxRunner } from '../components'

export default function Governance() {
  const { isTimelockAdmin } = useAdminRoles()
  const info = useTimelockInfo()
  const [reloadKey, setReloadKey] = useState(0)
  const { items, loading, error } = useTimelockQueue(reloadKey)
  const act = useTimelockAction()
  const { run, busy } = useTxRunner()
  const [nowS, setNowS] = useState(0)
  useEffect(() => {
    const tick = () => setNowS(Math.floor(Date.now() / 1000))
    const t0 = setTimeout(tick, 0)
    const t = setInterval(tick, 10_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Timelock</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Risk changes queued here wait {info.delayS === null ? '…' : `${Number(info.delayS) / 3600} hour(s)`} before
          they can be executed, giving users time to react. Admin: {info.admin ? shortAddr(info.admin) : '…'}.
          {info.hasRiskAdmin === false && ' Warning: the Timelock does not hold RISK_ADMIN, so executions will revert.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queued changes</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setReloadKey(k => k + 1)}>Refresh</Button>
        </CardHeader>
        {loading ? <p className="text-sm text-[var(--color-muted-foreground)]">Loading queue…</p>
          : error ? <p className="text-sm text-[var(--color-warning)]">{error}</p>
          : items.length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">Nothing queued.</p>
          : (
            <div className="divide-y divide-[var(--color-border)]">
              {items.map(tx => {
                const eta = Number(tx.eta)
                const expires = eta + Number(TIMELOCK_GRACE_PERIOD_S)
                const ready = nowS >= eta && nowS <= expires
                const expired = nowS > expires
                return (
                  <div key={tx.txHash} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="mono text-sm break-all">{tx.summary}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Executable {new Date(eta * 1000).toLocaleString()} · expires {new Date(expires * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {expired ? <Pill tone="danger">Expired</Pill> : ready ? <Pill tone="success">Ready</Pill> : <Pill tone="warning">Waiting</Pill>}
                      <ConfirmButton
                        disabled={!isTimelockAdmin || !ready}
                        loading={busy === `x-${tx.txHash}`}
                        onConfirm={() => void run(`x-${tx.txHash}`, `Executed ${tx.summary}`, () => act('executeTransaction', tx))
                          .then(ok => ok && setReloadKey(k => k + 1))}
                      >
                        Execute
                      </ConfirmButton>
                      <ConfirmButton
                        variant="secondary"
                        disabled={!isTimelockAdmin}
                        loading={busy === `c-${tx.txHash}`}
                        onConfirm={() => void run(`c-${tx.txHash}`, `Cancelled ${tx.summary}`, () => act('cancelTransaction', tx))
                          .then(ok => ok && setReloadKey(k => k + 1))}
                      >
                        Cancel
                      </ConfirmButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        {!isTimelockAdmin && <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">Only the Timelock admin can execute or cancel.</p>}
      </Card>
    </div>
  )
}
