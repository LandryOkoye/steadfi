/**
 * Access — who holds which LendingPool role, plus grant / revoke (OWNER).
 */
import { useState } from 'react'
import { isAddress } from 'viem'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { CONTRACTS, addrUrl } from '../../lib/steadfi'
import { useAdminRoles, usePoolAdminWrite, useRoleHolders } from '../useAdmin'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type RoleName } from '../abi'
import { ConfirmButton, Field, Pill, inputCls, shortAddr, useTxRunner } from '../components'

const ROLE_NAMES = Object.keys(ROLES) as RoleName[]

export default function Access() {
  const { isOwner } = useAdminRoles()
  const [reloadKey, setReloadKey] = useState(0)
  const { holders, error } = useRoleHolders(reloadKey)
  const write = usePoolAdminWrite()
  const { run, busy } = useTxRunner()
  const [role, setRole] = useState<RoleName>('PAUSE_GUARDIAN')
  const [account, setAccount] = useState('')
  const valid = isAddress(account)

  const label = (a: string) =>
    a.toLowerCase() === CONTRACTS.Timelock.toLowerCase() ? 'Timelock' : shortAddr(a)

  async function change(fn: 'grantRole' | 'revokeRole') {
    const ok = await run(fn, `${fn === 'grantRole' ? 'Granted' : 'Revoked'} ${ROLE_LABELS[role]}`,
      () => write(fn, [ROLES[role], account]))
    if (ok) setReloadKey(k => k + 1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Access control</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Roles on the LendingPool. In production, OWNER should be a multisig and RISK_ADMIN only the Timelock.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Role holders</CardTitle></CardHeader>
        {error ? <p className="text-sm text-[var(--color-warning)]">{error}</p>
          : !holders ? <p className="text-sm text-[var(--color-muted-foreground)]">Loading role history…</p>
          : (
            <div className="divide-y divide-[var(--color-border)]">
              {ROLE_NAMES.map(r => (
                <div key={r} className="py-3 grid gap-2 md:grid-cols-[1fr_2fr]">
                  <div>
                    <p className="text-sm font-semibold">{ROLE_LABELS[r]}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{ROLE_DESCRIPTIONS[r]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-start">
                    {holders[r].length === 0 ? <Pill tone="muted">Nobody</Pill> : holders[r].map(a => (
                      <a key={a} href={addrUrl(a)} target="_blank" rel="noreferrer"
                        className="mono text-xs rounded-lg border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-primary)]">
                        {label(a)}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Grant or revoke</CardTitle></CardHeader>
        {!isOwner && <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">Only the OWNER can change roles.</p>}
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto] items-end">
          <Field label="Role">
            <select className={inputCls} value={role} onChange={e => setRole(e.target.value as RoleName)} disabled={!isOwner}>
              {ROLE_NAMES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Wallet or contract address">
            <input className={inputCls} value={account} onChange={e => setAccount(e.target.value.trim())} placeholder="0x…" disabled={!isOwner} />
          </Field>
          <ConfirmButton disabled={!isOwner || !valid} loading={busy === 'grantRole'} onConfirm={() => void change('grantRole')}>
            Grant
          </ConfirmButton>
          <ConfirmButton variant="danger" disabled={!isOwner || !valid} loading={busy === 'revokeRole'} onConfirm={() => void change('revokeRole')}>
            Revoke
          </ConfirmButton>
        </div>
        {account && !valid && <p className="mt-2 text-xs text-[var(--color-destructive)]">Invalid address</p>}
        <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">
          The contract blocks the owner from revoking their own OWNER role, so the pool can't be left ownerless by mistake.
        </p>
      </Card>
    </div>
  )
}
