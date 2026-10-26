/**
 * LegacyPoolNotice — the pool was redeployed on 2026-10-26. If the connected
 * wallet still has funds in the previous pool, list them with a one-click
 * withdrawal back to the wallet. Debt there must be repaid before collateral
 * can be withdrawn, so that case is explained instead.
 */
import { useState } from 'react'
import { useAccount, useReadContracts, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import Button from './ui/Button'
import TokenIcon from './ui/TokenIcon'
import { SYMBOLS, useConfirmTx } from '../hooks/useSteadFi'
import { ARC_TESTNET_CHAIN_ID, LEGACY_POOL, LENDING_POOL_ABI, TOKENS, type TokenSymbol, formatToken } from '../lib/steadfi'
import { errMsg, toastTx } from './actions/shared'

export default function LegacyPoolNotice() {
  const { address } = useAccount()
  const reads = useReadContracts({
    contracts: address ? SYMBOLS.flatMap(sym => ([
      { address: LEGACY_POOL, abi: LENDING_POOL_ABI, functionName: 'getUserSupply' as const, args: [address, TOKENS[sym].address] as const, chainId: ARC_TESTNET_CHAIN_ID },
      { address: LEGACY_POOL, abi: LENDING_POOL_ABI, functionName: 'getUserDebt' as const, args: [address, TOKENS[sym].address] as const, chainId: ARC_TESTNET_CHAIN_ID },
    ])) : [],
    query: { enabled: !!address, refetchInterval: 30_000 },
  })
  const { writeContractAsync } = useWriteContract()
  const confirm = useConfirmTx()
  const [busy, setBusy] = useState<TokenSymbol | null>(null)

  const rows = SYMBOLS.map((sym, i) => ({
    sym,
    supply: (reads.data?.[i * 2]?.result as bigint | undefined) ?? 0n,
    debt: (reads.data?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n,
  }))
  const supplied = rows.filter(r => r.supply > 0n)
  const hasDebt = rows.some(r => r.debt > 0n)
  if (!address || supplied.length === 0) return null

  async function withdraw(sym: TokenSymbol, amount: bigint) {
    setBusy(sym)
    try {
      const hash = await writeContractAsync({
        address: LEGACY_POOL, abi: LENDING_POOL_ABI, functionName: 'withdraw',
        args: [TOKENS[sym].address, amount], chainId: ARC_TESTNET_CHAIN_ID,
      })
      await confirm(hash)
      toastTx(`Withdrew ${formatToken(amount, TOKENS[sym].decimals)} ${sym} from the previous pool`, hash)
    } catch (e) {
      toast.error('Withdraw failed', { description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-labelledby="legacy-title"
      className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_6%,transparent)] p-5"
    >
      <div className="flex items-start gap-3">
        <ArrowCounterClockwise size={20} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="legacy-title" className="text-base font-semibold">You have funds in the previous SteadFi pool</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            SteadFi moved to an upgraded pool on Oct 26, 2026. Withdraw these back to your wallet, then supply them here if you like.
            {hasDebt && ' You also have debt there: repay it in the old pool first, or collateral withdrawals will fail.'}
          </p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {supplied.map(r => (
              <li key={r.sym} className="flex items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] py-2 pl-2 pr-2">
                <TokenIcon symbol={r.sym} size={28} />
                <span className="mono text-sm font-medium">{formatToken(r.supply, TOKENS[r.sym].decimals)} {r.sym}</span>
                <Button size="sm" variant="primary" loading={busy === r.sym} disabled={busy !== null}
                  onClick={() => void withdraw(r.sym, r.supply)}>
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
