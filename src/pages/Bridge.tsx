/**
 * Bridge In — real CCTP transfer into Arc using Circle App Kit.
 * The user signs a burn on the source chain and a mint on Arc from their wallet.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import {
  ArcTestnet, EthereumSepolia, BaseSepolia, ArbitrumSepolia, OptimismSepolia,
} from '@circle-fin/app-kit/chains'
import { ArrowSquareOut, CheckCircle, Info, WarningCircle } from '@phosphor-icons/react'
import { CCTP, EXPLORER_BASE, txUrl } from '../lib/steadfi'

const SOURCE_CHAINS = [
  { key: 'eth-sepolia', label: 'Ethereum Sepolia', chain: EthereumSepolia },
  { key: 'base-sepolia', label: 'Base Sepolia', chain: BaseSepolia },
  { key: 'arb-sepolia', label: 'Arbitrum Sepolia', chain: ArbitrumSepolia },
  { key: 'op-sepolia', label: 'OP Sepolia', chain: OptimismSepolia },
] as const

type BridgeStepView = {
  name: string
  state: 'pending' | 'success' | 'error' | 'noop'
  txHash?: string
  explorerUrl?: string
  errorMessage?: string
}

export default function Bridge() {
  const { connector, isConnected } = useAccount()
  const [chainKey, setChainKey] = useState<string>(SOURCE_CHAINS[0].key)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ state: string; steps: BridgeStepView[] } | null>(null)

  const source = SOURCE_CHAINS.find(c => c.key === chainKey) ?? SOURCE_CHAINS[0]
  const numAmount = parseFloat(amount) || 0

  async function handleBridge() {
    if (!numAmount || !connector) return
    setBusy(true)
    setResult(null)
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({
        provider,
        capabilities: {
          addressContext: 'user-controlled',
          supportedChains: [
            EthereumSepolia, BaseSepolia, ArbitrumSepolia, OptimismSepolia, ArcTestnet,
          ],
        },
      })

      const kit = new AppKit()
      const res = await kit.bridge({
        from: { adapter, chain: source.chain },
        to: { adapter, chain: ArcTestnet },
        amount,
      })

      const steps: BridgeStepView[] = res.steps.map(s => ({
        name: s.name,
        state: s.state,
        ...(s.txHash ? { txHash: s.txHash } : {}),
        ...(s.explorerUrl ? { explorerUrl: s.explorerUrl } : {}),
        ...(s.errorMessage ? { errorMessage: s.errorMessage } : {}),
      }))
      setResult({ state: res.state, steps })

      if (res.state === 'success') {
        toast.success(`Bridged ${amount} USDC to Arc Testnet`)
        setAmount('')
      } else if (res.state === 'error') {
        toast.error('Bridge failed', {
          description: steps.find(s => s.state === 'error')?.errorMessage ?? 'See steps below.',
        })
      }
    } catch (e: unknown) {
      toast.error('Bridge failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="mb-2">
        <p className="text-sm text-[var(--color-muted-foreground)]">Circle CCTP</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-semibold">Bridge USDC to Arc</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
          Move USDC to Arc with Circle’s Cross-Chain Transfer Protocol, then supply it on SteadFi.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Select source chain</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_CHAINS.map(c => (
            <button
              key={c.key}
              onClick={() => { setChainKey(c.key); setResult(null) }}
              aria-pressed={chainKey === c.key}
              className={`h-11 rounded-[12px] border text-sm font-medium transition-base cursor-pointer
                ${chainKey === c.key
                  ? 'border-[var(--color-foreground)] bg-[var(--color-muted)] text-[var(--color-foreground)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-foreground)]'
                }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Bridge USDC</CardTitle></CardHeader>
        <AmountInput
          label={`Amount of USDC on ${source.label}`}
          value={amount}
          onChange={setAmount}
          symbol="USDC"
          usdEquiv={numAmount > 0 ? numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="bridge-amount"
        />

        <div className="mt-4 rounded-[14px] border border-[var(--color-border)] p-3 text-xs space-y-1">
          <p><span className="text-[var(--color-muted-foreground)]">From:</span> {source.label}</p>
          <p><span className="text-[var(--color-muted-foreground)]">To:</span> Arc (domain {CCTP!.domain})</p>
          <p className="break-all"><span className="text-[var(--color-muted-foreground)]">Mint recipient:</span> {isConnected ? 'your connected wallet' : 'connect wallet'}</p>
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)] mt-3">
          Your wallet will ask you to switch to {source.label} for the burn, then to Arc for the mint.
          Both transactions are signed by you.
        </p>

        {isConnected ? (
          <Button
            variant="primary"
            className="w-full mt-5"
            loading={busy}
            disabled={!numAmount}
            onClick={() => { void handleBridge() }}
          >
            {busy ? 'Bridging…' : `Bridge ${amount || 'USDC'}`}
          </Button>
        ) : (
          <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
            Connect your wallet to bridge
          </p>
        )}
      </Card>

      {result && (
        <Card>
          <CardHeader><CardTitle>3. Transfer status</CardTitle></CardHeader>
          <div className="space-y-2">
            {result.steps.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-start justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                <div className="flex items-start gap-2">
                  {s.state === 'success' && <CheckCircle size={14} className="text-[var(--color-success)] mt-0.5" aria-hidden="true" />}
                  {s.state === 'error' && <WarningCircle size={14} className="text-[var(--color-destructive)] mt-0.5" aria-hidden="true" />}
                  {(s.state === 'pending' || s.state === 'noop') && <Info size={14} className="text-[var(--color-muted-foreground)] mt-0.5" aria-hidden="true" />}
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{s.state}</p>
                    {s.errorMessage && <p className="text-xs text-[var(--color-destructive)] mt-0.5">{s.errorMessage}</p>}
                  </div>
                </div>
                {s.txHash && (
                  <a
                    href={s.explorerUrl ?? txUrl(s.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-primary)] text-xs inline-flex items-center gap-1"
                  >
                    tx <ArrowSquareOut size={11} aria-hidden="true" />
                  </a>
                )}
              </div>
            ))}
          </div>
          {result.state === 'success' && (
            <p className="text-xs text-[var(--color-success)] mt-3">
              USDC has arrived on Arc. Supply it from your Dashboard to start earning.
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>CCTP contracts (Arc)</CardTitle></CardHeader>
        <div className="rounded-[14px] border border-[var(--color-border)] p-3 text-xs font-mono space-y-1 overflow-x-auto">
          <p className="text-[var(--color-muted-foreground)]">// MessageTransmitterV2</p>
          <p className="break-all">{CCTP!.MessageTransmitterV2}</p>
          <p className="text-[var(--color-muted-foreground)] mt-2">// TokenMessengerV2</p>
          <p className="break-all">{CCTP!.TokenMessengerV2}</p>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <a
            href={`${EXPLORER_BASE}/address/${CCTP!.MessageTransmitterV2}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            MessageTransmitter <ArrowSquareOut size={11} aria-hidden="true" />
          </a>
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            USDC faucet <ArrowSquareOut size={11} aria-hidden="true" />
          </a>
        </div>
      </Card>

      <div className="flex gap-3 p-4 rounded-2xl bg-[var(--color-muted)] border border-[var(--color-border)]">
        <Info size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          CCTP bridging is permissionless and non-custodial. Attestations usually arrive within 2–5 minutes.
          Arc uses USDC for gas, so you do not need any other token.
        </p>
      </div>
    </div>
  )
}
