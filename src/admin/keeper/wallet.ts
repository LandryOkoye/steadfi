/**
 * Keeper wallet — src/admin/keeper/wallet.ts
 *
 * Two modes, selectable in the UI:
 *   A) "Browser keeper wallet" — a key generated/imported in this browser,
 *      encrypted at rest in localStorage under a user passphrase (PBKDF2
 *      → AES-GCM), decrypted only in memory while unlocked. Enables
 *      unattended auto-run.
 *   B) "Connected wallet" — uses the wagmi-connected wallet. Every tx needs
 *      a wallet confirmation, so only "Run once" is available.
 *
 * Never prints/logs/bundles the raw key. Persistent warning: hot wallet —
 * keep only a small balance.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { type Hex, isHex } from 'viem'

const STORAGE_KEY = 'steadfi.keeper.wallet.v1'
const PBKDF2_ITERATIONS = 210_000

export interface StoredWallet {
  salt: string      // hex
  iv: string        // hex
  ciphertext: string // hex
  address: string
}

export interface WalletRef {
  mode: 'browser' | 'connected'
  address: `0x${string}` | null
  unlocked: boolean   // browser mode: key held in memory
  balanceUsdc: number | null
  error: string | null
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export function getStoredWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredWallet
  } catch {
    return null
  }
}

export async function encryptWallet(privateKey: Hex, passphrase: string): Promise<StoredWallet> {
  if (!isHex(privateKey)) throw new Error('invalid private key')
  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(salt)
  crypto.getRandomValues(iv)
  const key = await deriveKey(passphrase, salt.buffer)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(privateKey)
  )
  return {
    salt: Buffer.from(salt).toString('hex'),
    iv: Buffer.from(iv).toString('hex'),
    ciphertext: Buffer.from(new Uint8Array(ct)).toString('hex'),
    address: privateKeyToAccount(privateKey).address,
  }
}

export async function decryptWallet(stored: StoredWallet, passphrase: string): Promise<Hex> {
  const salt = Buffer.from(stored.salt, 'hex')
  const iv = Buffer.from(stored.iv, 'hex')
  const ct = Buffer.from(stored.ciphertext, 'hex')
  const key = await deriveKey(passphrase, salt.buffer)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ct
  )
  const hex = decoder.decode(new Uint8Array(pt))
  if (!isHex(hex)) throw new Error('decryption failed — wrong passphrase')
  return hex as Hex
}

export function clearStoredWallet() {
  localStorage.removeItem(STORAGE_KEY)
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export { generatePrivateKey }
