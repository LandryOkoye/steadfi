/**
 * KeeperProvider — src/admin/keeper/KeeperProvider.tsx
 *
 * Context that owns ONE KeeperEngine instance, mounted in AdminApp above the
 * routes so navigating between admin tabs does NOT stop the keeper.
 *
 * Two wallet modes:
 *   A) "Browser keeper wallet" — key decrypted from localStorage, held in
 *      memory while unlocked. Engine sends via a viem WalletClient built from
 *      that key (unattended auto-run possible).
 *   B) "Connected wallet" — uses wagmi's connected wallet. Every tx needs a
 *      wallet confirmation, so only "Run once" is available (Start/auto-run
 *      disabled).
 *
 * Exposes state + actions: start, stop, runOnce, updateSettings, wallet
 * actions (create/import/unlock/lock/fund/withdraw/export/forget).
 * Persists settings (not keys) and the last 200 log entries in localStorage.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { privateKeyToAccount, type Address } from 'viem/accounts'
import { type Hex, createWalletClient, http, type WalletClient, type PublicClient, type Abi } from 'viem'
import { arc, arcTestnet } from 'viem/chains'

import { KeeperEngine, DEFAULT_SETTINGS, KeeperSettings, KeeperEvent, SendTx, EngineState } from './engine'
import {
  WalletRef, encryptWallet, decryptWallet, getStoredWallet, clearStoredWallet, generatePrivateKey,
} from './wallet'
import { toast } from 'sonner'

const STORAGE_SETTINGS = 'steadfi.keeper.settings.v1'
const STORAGE_LOGS = 'steadfi.keeper.logs.v1'
const MAX_LOGS = 200

interface KeeperContextValue {
  state: EngineState
  settings: KeeperSettings
  events: KeeperEvent[]
  start: () => Promise<void>
  stop: () => void
  runOnce: () => Promise<void>
  updateSettings: (patch: Partial<KeeperSettings>) => void
  wallet: WalletRef
  createWallet: (passphrase: string) => Promise<void>
  importWallet: (privateKey: Hex, passphrase: string) => Promise<void>
  unlockWallet: (passphrase: string) => Promise<void>
  lockWallet: () => void
  fundWallet: (amountUsdc: number) => Promise<void>
  withdrawWallet: () => Promise<void>
  exportWallet: (passphrase: string) => Promise<Hex | null>
  forgetWallet: () => Promise<void>
  setConnectedWallet: (address: Address | null) => void
}

const KeeperContext = createContext<KeeperContextValue | null>(null)

export function KeeperProvider({ children }: { children: ReactNode }) {
  const { address: connectedAddress } = useAccount()
  const publicClient = usePublicClient()
  const { data: wagmiWalletClient } = useWalletClient()

  const engineRef = useRef<KeeperEngine | null>(null)
  const [wallet, setWallet] = useState<WalletRef>({
    mode: 'connected',
    address: connectedAddress ?? null,
    unlocked: true,
    balanceUsdc: null,
    error: null,
  })
  const [events, setEvents] = useState<KeeperEvent[]>(loadLogs())
  const [settings, setSettingsState] = useState<KeeperSettings>(() => loadSettings())
  const signerKeyRef = useRef<Hex | null>(null)

  const engine = engineRef.current ?? new KeeperEngine(settings)
  engineRef.current = engine

  // Persist logs + toasts
  const logRef = useRef<(ev: KeeperEvent) => void>((ev) => {
    setEvents(prev => {
      const next = [ev, ...prev].slice(0, MAX_LOGS)
      try { localStorage.setItem(STORAGE_LOGS, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
    if (ev.type === 'error') toast.error(ev.message)
    else if (ev.type === 'warning') toast.warning(ev.message)
  })
  engine.on(logRef.current)

  // Sync settings
  useEffect(() => {
    engine.updateSettings(settings)
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)) } catch { /* noop */ }
  }, [settings, engine])

  // Re-wire sendTx when wallet mode / connected client changes
  useEffect(() => {
    const account = wallet.mode === 'connected' ? connectedAddress : wallet.address
    if (wallet.mode === 'browser' && wallet.unlocked && signerKeyRef.current && publicClient) {
      engine.setSendTx(makeSendTxFromKey(signerKeyRef.current, publicClient))
    } else if (wallet.mode === 'connected' && wagmiWalletClient && publicClient) {
      engine.setSendTx(makeSendTx(wagmiWalletClient, publicClient))
    } else {
      engine.setSendTx(null)
    }
    engine.setWalletAccount(account ?? null)
  }, [wallet.mode, wallet.unlocked, signerKeyRef.current, connectedAddress, wagmiWalletClient, publicClient, engine])

  // ── Wallet actions ────────────────────────────────────────────────────

  const createWallet = async (passphrase: string) => {
    const key = generatePrivateKey()
    const stored = await encryptWallet(key, passphrase)
    signerKeyRef.current = key
    setWallet({
      mode: 'browser',
      address: stored.address as Address,
      unlocked: true,
      balanceUsdc: null,
      error: null,
    })
    if (publicClient) engine.setSendTx(makeSendTxFromKey(key, publicClient))
    toast.success('Keeper wallet created')
  }

  const importWallet = async (privateKey: Hex, passphrase: string) => {
    const stored = await encryptWallet(privateKey, passphrase)
    signerKeyRef.current = privateKey
    setWallet({
      mode: 'browser',
      address: stored.address as Address,
      unlocked: true,
      balanceUsdc: null,
      error: null,
    })
    if (publicClient) engine.setSendTx(makeSendTxFromKey(privateKey, publicClient))
    toast.success('Keeper wallet imported')
  }

  const unlockWallet = async (passphrase: string) => {
    const stored = getStoredWallet()
    if (!stored) throw new Error('No stored wallet')
    const key = await decryptWallet(stored, passphrase)
    signerKeyRef.current = key
    setWallet(w => ({ ...w, unlocked: true, address: stored.address as Address }))
    if (publicClient) {
      engine.setSendTx(makeSendTxFromKey(key, publicClient))
      engine.setWalletAccount(stored.address as Address)
    }
    toast.success('Keeper wallet unlocked')
  }

  const lockWallet = () => {
    signerKeyRef.current = null
    setWallet(w => ({ ...w, unlocked: false }))
    engine.setSendTx(null)
    engine.setWalletAccount(null)
  }

  const fundWallet = async (amountUsdc: number) => {
    toast.info('Fund: send USDC to the keeper address from your connected wallet')
  }

  const withdrawWallet = async () => {
    toast.info('Withdraw: use the connected wallet to pull keeper funds back')
  }

  const exportWallet = async (passphrase: string): Promise<Hex | null> => {
    const stored = getStoredWallet()
    if (!stored) return null
    try {
      return await decryptWallet(stored, passphrase)
    } catch {
      return null
    }
  }

  const forgetWallet = async () => {
    clearStoredWallet()
    signerKeyRef.current = null
    setWallet({ mode: 'connected', address: connectedAddress ?? null, unlocked: true, balanceUsdc: null, error: null })
    lockWallet()
    toast.success('Keeper wallet forgotten')
  }

  const setConnectedWallet = (address: Address | null) => {
    setWallet(w => ({ ...w, address, mode: 'connected', unlocked: true }))
    engine.setWalletAccount(address)
    if (wagmiWalletClient && publicClient) {
      engine.setSendTx(makeSendTx(wagmiWalletClient, publicClient))
    }
  }

  const start = async () => {
    await engine.start()
  }

  const stop = () => {
    engine.stop()
  }

  const runOnce = async () => {
    await engine.runOnce()
  }

  const updateSettings = (patch: Partial<KeeperSettings>) => {
    setSettingsState(s => ({ ...s, ...patch }))
  }

  const value: KeeperContextValue = {
    state: engine.getState(),
    settings,
    events,
    start, stop, runOnce, updateSettings,
    wallet,
    createWallet, importWallet, unlockWallet, lockWallet,
    fundWallet, withdrawWallet, exportWallet, forgetWallet,
    setConnectedWallet,
  }

  return <KeeperContext.Provider value={value}>{children}</KeeperContext.Provider>
}

export function useKeeper() {
  const ctx = useContext(KeeperContext)
  if (!ctx) throw new Error('useKeeper must be used within KeeperProvider')
  return ctx
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSendTx(walletClient: WalletClient, publicClient: PublicClient): SendTx {
  return async ({ address, abi, functionName, args, value }) => {
    const { request } = await publicClient.simulateContract({
      address,
      abi: abi as unknown as Abi,
      functionName,
      args,
      account: walletClient.account?.address as `0x${string}`,
      ...(value ? { value } : {}),
    })
    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
    const costUsdc = Number(receipt.gasUsed * BigInt(receipt.effectiveGasPrice ?? 0n)) / 1e18
    return {
      hash,
      receipt: {
        status: receipt.status === 'success' ? 1n : 0n,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice ?? 0n,
      },
      costUsdc,
    }
  }
}

function makeSendTxFromKey(privateKey: Hex, publicClient: PublicClient): SendTx {
  const account = privateKeyToAccount(privateKey)
  const isMainnet = process.env.VITE_NETWORK !== 'testnet'
  const chain = isMainnet ? arc : arcTestnet
  const walletClient = createWalletClient({ chain, account, transport: http() })
  return makeSendTx(walletClient, publicClient)
}

function loadSettings(): KeeperSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* noop */ }
  return { ...DEFAULT_SETTINGS }
}

function loadLogs(): KeeperEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_LOGS)
    if (raw) return JSON.parse(raw) as KeeperEvent[]
  } catch { /* noop */ }
  return []
}
