/**
 * Bridge In — guided flow to bring USDC from another chain to Arc via CCTP.
 * Renders real CCTP testnet addresses and links. Does not simulate the bridge —
 * shows instructions and links to the Bridge Kit to handle the actual transfer.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Info, ArrowSquareOut } from '@phosphor-icons/react'
import { CCTP, CONTRACTS, EXPLORER_BASE } from '../lib/steadfi'

const SOURCE_CHAINS = [
  { id: 'eth-sepolia',  label: 'Ethereum Sepolia', domain: 0,  testnetFaucet: 'https://faucet.circle.com' },
  { id: 'base-sepolia', label: 'Base Sepolia',     domain: 6,  testnetFaucet: 'https://faucet.circle.com' },
  { id: 'arb-sepolia',  label: 'Arbitrum Sepolia', domain: 3,  testnetFaucet: 'https://faucet.circle.com' },
  { id: 'op-sepolia',   label: 'OP Sepolia',       domain: 2,  testnetFaucet: 'https://faucet.circle.com' },
]

export default function Bridge() {
  const [chainIdx, setChainIdx] = useState(0)
  const chain = SOURCE_CHAINS[chainIdx]

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Bridge In</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Move USDC from another chain to Arc Testnet via Circle CCTP — then deposit into SteadFi.
        </p>
      </div>

      {/* Step 1 — select source */}
      <Card>
        <CardHeader><CardTitle>1. Select source chain</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_CHAINS.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setChainIdx(i)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-base cursor-pointer
                ${chainIdx === i
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Step 2 — CCTP contract info */}
      <Card>
        <CardHeader><CardTitle>2. Burn USDC on {chain.label}</CardTitle></CardHeader>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Call <code className="text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">depositForBurn</code> on the{' '}
          <strong>TokenMessengerV2</strong> contract on {chain.label}.
          Set <code className="text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">destinationDomain = {CCTP.domain}</code> (Arc Testnet).
        </p>
        <div className="rounded-xl bg-[var(--color-muted)] p-3 text-xs font-mono space-y-1 overflow-x-auto">
          <p className="text-[var(--color-muted-foreground)]">// Arc Testnet destination domain</p>
          <p>destinationDomain = <span className="text-[var(--color-primary)]">{CCTP.domain}</span></p>
          <p className="text-[var(--color-muted-foreground)] mt-2">// Recipient: your wallet on Arc Testnet</p>
          <p>mintRecipient = <span className="text-[var(--color-accent)]">{'<your Arc address>'}</span></p>
        </div>
        <a
          href="https://developers.circle.com/stablecoins/cctp-usdc-bridging"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mt-3"
        >
          CCTP developer docs <ArrowSquareOut size={11} aria-hidden="true" />
        </a>
      </Card>

      {/* Step 3 — Attest + Mint */}
      <Card>
        <CardHeader><CardTitle>3. Receive USDC on Arc Testnet</CardTitle></CardHeader>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          After the burn is confirmed, call <code className="text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">receiveMessage</code> on
          the Arc Testnet <strong>MessageTransmitterV2</strong> with the Circle attestation.
          USDC will appear in your wallet on Arc Testnet.
        </p>
        <div className="rounded-xl bg-[var(--color-muted)] p-3 text-xs font-mono overflow-x-auto">
          <p className="text-[var(--color-muted-foreground)] mb-1">// Arc Testnet MessageTransmitterV2</p>
          <p className="break-all">{CCTP.MessageTransmitterV2}</p>
          <p className="text-[var(--color-muted-foreground)] mt-2 mb-1">// Arc Testnet TokenMessengerV2</p>
          <p className="break-all">{CCTP.TokenMessengerV2}</p>
        </div>
        <a
          href={`${EXPLORER_BASE}/address/${CCTP.MessageTransmitterV2}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mt-3"
        >
          View MessageTransmitterV2 on explorer <ArrowSquareOut size={11} aria-hidden="true" />
        </a>
      </Card>

      {/* Step 4 — Deposit into SteadFi */}
      <Card>
        <CardHeader>
          <CardTitle>4. Deposit into SteadFi</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Once USDC arrives on Arc Testnet, head to the <strong>Supply</strong> page to earn interest.
        </p>
        <div className="rounded-xl bg-[var(--color-muted)] p-3 text-xs font-mono overflow-x-auto">
          <p className="text-[var(--color-muted-foreground)] mb-1">// SteadFi LendingPool on Arc Testnet</p>
          <p className="break-all">{CONTRACTS.LendingPool}</p>
        </div>
        <a
          href={`${EXPLORER_BASE}/address/${CONTRACTS.LendingPool}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mt-3"
        >
          View LendingPool on explorer <ArrowSquareOut size={11} aria-hidden="true" />
        </a>
      </Card>

      {/* Info box */}
      <div className="flex gap-3 p-4 rounded-2xl bg-[var(--color-muted)] border border-[var(--color-border)]">
        <Info size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          CCTP cross-chain bridging is permissionless and non-custodial.
          Circle Circle attestations are typically available within 2–5 minutes on testnet.
          On Arc Testnet, USDC is the native gas token — you do not need ETH or any other token for gas.
        </p>
      </div>
    </div>
  )
}
