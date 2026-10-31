/**
 * Owns the one KeeperEngine for the admin console. Mounted above the admin
 * routes, so switching tabs never stops a running keeper (closing the tab does).
 *
 * Keeper wallet modes:
 *   browser   — encrypted key in this browser (wallet.ts); signs locally, can auto-run.
 *   connected — the wagmi wallet; every tx needs a confirmation, so Run once only.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useAccount, useBalance, usePublicClient, useWalletClient } from 'wagmi'
import { createWalletClient, parseUnits, type Hex, type PublicClient } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { activeChain, arcTransport } from '../../config'
import { ARC_CHAIN_ID } from '../../lib/steadfi'
import { KeeperEngine, DEFAULT_SETTINGS, type KeeperSettings, type KeeperSigner, type KeeperSnapshot, type LogEntry } from './engine'
import {
  clearStoredWallet, decryptStoredWallet, loadStoredWallet, normalizePrivateKey, saveNewWallet, type StoredWallet,
} from './wallet'

const SETTINGS_KEY = `steadfi.keeper.settings.v2.${ARC_CHAIN_ID}`
const LOGS_KEY = `steadfi.keeper.logs.v2.${ARC_CHAIN_ID}`
const MODE_KEY = `steadfi.keeper.mode.v2.${ARC_CHAIN_ID}`
/** Native USDC has 18 decimals but only 6 are meaningful; transfers stay on that grid. */
const NATIVE_GRID = 10n ** 12n

export type WalletMode = 'browser' | 'connected'

interface KeeperContextValue {
  snap: KeeperSnapshot
  start: () => void
  stop: () => void
  runOnce: () => void
  updateSettings: (p: Partial<KeeperSettings>) => void
  clearLogs: () => void

  mode: WalletMode
  setMode: (m: WalletMode) => void
  stored: StoredWallet | null
  unlocked: boolean
  /** Address that signs keeper txs in the current mode (null when locked / not connected). */
  keeperAddress: `0x${string}` | null
  balanceUsdc: number | null
  refetchBalance: () => void

  createWallet: (passphrase: string) => Promise<void>
  importWallet: (privateKey: string, passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<void>
  lock: () => void
  exportKey: (passphrase: string) => Promise<Hex>
  forget: () => void
  fund: (amountUsdc: string) => Promise<Hex>
  withdrawAll: () => Promise<Hex>
}

const KeeperContext = createContext<KeeperContextValue | null>(null)

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* convenience only */ }
}

function loadLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOGS_KEY)
    return raw ? JSON.parse(raw) as LogEntry[] : []
  } catch {
    return []
  }
}

export function KeeperProvider({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID }) as PublicClient | undefined
  const { address: connectedAddress } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID })

  const [engine] = useState(() => new KeeperEngine(readJson(SETTINGS_KEY, DEFAULT_SETTINGS), loadLogs()))
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot)

  const [stored, setStored] = useState<StoredWallet | null>(() => loadStoredWallet())
  const [mode, setModeState] = useState<WalletMode>(() => {
    try {
      const m = localStorage.getItem(MODE_KEY)
      if (m === 'browser' || m === 'connected') return m
    } catch { /* default below */ }
    return 'browser'
  })
  const accountRef = useRef<PrivateKeyAccount | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const keeperAddress = mode === 'browser'
    ? (unlocked ? accountRef.current?.address ?? null : stored?.address ?? null)
    : connectedAddress ?? null

  const balance = useBalance({
    address: keeperAddress ?? undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!keeperAddress, refetchInterval: 15_000 },
  })
  const balanceUsdc = balance.data ? Number(balance.data.value) / 1e18 : null

  useEffect(() => { if (publicClient) engine.setClient(publicClient) }, [engine, publicClient])

  // Signer for the active mode.
  useEffect(() => {
    let signer: KeeperSigner | null = null
    const account = accountRef.current
    if (mode === 'browser' && unlocked && account) {
      const wc = createWalletClient({ account, chain: activeChain, transport: arcTransport })
      signer = {
        address: account.address,
        canAutoRun: true,
        sendCall: call => wc.writeContract({ ...call, account, chain: activeChain } as never),
      }
    } else if (mode === 'connected' && walletClient && connectedAddress) {
      signer = {
        address: connectedAddress,
        canAutoRun: false,
        sendCall: call => walletClient.writeContract({ ...call, account: walletClient.account, chain: activeChain } as never),
      }
    }
    engine.setSigner(signer)
  }, [engine, mode, unlocked, walletClient, connectedAddress])

  useEffect(() => writeJson(SETTINGS_KEY, snap.settings), [snap.settings])
  useEffect(() => writeJson(LOGS_KEY, snap.logs), [snap.logs])

  // Keep the price table live while the keeper is idle.
  useEffect(() => {
    if (!publicClient) return
    void engine.refresh()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && engine.getSnapshot().status === 'idle') void engine.refresh()
    }, 20_000)
    return () => clearInterval(t)
  }, [engine, publicClient])

  // Closing the tab stops the keeper: warn first.
  useEffect(() => {
    if (snap.status !== 'running') return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [snap.status])

  const setMode = useCallback((m: WalletMode) => {
    engine.stop()
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* convenience only */ }
  }, [engine])

  const adopt = useCallback((account: PrivateKeyAccount) => {
    accountRef.current = account
    setStored(loadStoredWallet())
    setUnlocked(true)
    setModeState('browser')
    try { localStorage.setItem(MODE_KEY, 'browser') } catch { /* convenience only */ }
  }, [])

  const lock = useCallback(() => {
    engine.stop()
    accountRef.current = null
    setUnlocked(false)
  }, [engine])

  const value = useMemo<KeeperContextValue>(() => ({
    snap,
    start: () => void engine.start(),
    stop: () => engine.stop(),
    runOnce: () => void engine.runOnce(),
    updateSettings: p => engine.updateSettings(p),
    clearLogs: () => engine.clearLogs(),

    mode, setMode, stored, unlocked, keeperAddress, balanceUsdc,
    refetchBalance: () => void balance.refetch(),

    createWallet: async passphrase => adopt(await saveNewWallet(passphrase)),
    importWallet: async (key, passphrase) => adopt(await saveNewWallet(passphrase, normalizePrivateKey(key))),
    unlock: async passphrase => {
      if (!stored) throw new Error('No keeper wallet in this browser')
      adopt(privateKeyToAccount(await decryptStoredWallet(stored, passphrase)))
    },
    lock,
    exportKey: async passphrase => {
      if (!stored) throw new Error('No keeper wallet in this browser')
      return decryptStoredWallet(stored, passphrase)
    },
    forget: () => {
      lock()
      clearStoredWallet()
      setStored(null)
    },
    fund: async amount => {
      if (!walletClient || !connectedAddress) throw new Error('Connect a wallet to fund the keeper')
      if (!stored) throw new Error('Create a keeper wallet first')
      if (!/^\d*\.?\d{0,6}$/.test(amount.trim()) || Number(amount) <= 0) throw new Error('Enter a USDC amount (up to 6 decimals)')
      const hash = await walletClient.sendTransaction({
        account: walletClient.account, chain: activeChain, to: stored.address, value: parseUnits(amount.trim(), 18),
      })
      await publicClient?.waitForTransactionReceipt({ hash })
      void balance.refetch()
      return hash
    },
    withdrawAll: async () => {
      const account = accountRef.current
      if (!account || !publicClient) throw new Error('Unlock the keeper wallet first')
      if (!connectedAddress) throw new Error('Connect the wallet to send the funds to')
      engine.stop()
      const [bal, block, gas] = await Promise.all([
        publicClient.getBalance({ address: account.address }),
        publicClient.getBlock(),
        publicClient.estimateGas({ account: account.address, to: connectedAddress, value: 1n }),
      ])
      const maxFeePerGas = (block.baseFeePerGas ?? 20n * 10n ** 9n) * 2n
      const gasLimit = gas * 12n / 10n
      const sendable = (bal - gasLimit * maxFeePerGas) / NATIVE_GRID * NATIVE_GRID
      if (sendable <= 0n) throw new Error('Balance is too small to cover the transfer gas')
      const wc = createWalletClient({ account, chain: activeChain, transport: arcTransport })
      const hash = await wc.sendTransaction({
        to: connectedAddress, value: sendable, gas: gasLimit, maxFeePerGas, maxPriorityFeePerGas: 0n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      void balance.refetch()
      return hash
    },
  }), [snap, engine, mode, setMode, stored, unlocked, keeperAddress, balanceUsdc, balance, adopt, lock, walletClient, connectedAddress, publicClient])

  return <KeeperContext.Provider value={value}>{children}</KeeperContext.Provider>
}

export function useKeeper() {
  const ctx = useContext(KeeperContext)
  if (!ctx) throw new Error('useKeeper must be used within KeeperProvider')
  return ctx
}
