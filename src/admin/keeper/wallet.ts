/**
 * Browser keeper wallet: a key generated or imported in this browser, kept in
 * localStorage only in encrypted form (PBKDF2-SHA256 → AES-GCM under a user
 * passphrase). The decrypted key exists only in memory while unlocked and is
 * never logged or sent anywhere.
 *
 * Stored per chain id, so a testnet keeper key is never picked up on mainnet.
 */

import { bytesToHex, hexToBytes, isHex, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { ARC_CHAIN_ID } from '../../lib/steadfi'

const STORAGE_KEY = `steadfi.keeper.wallet.v2.${ARC_CHAIN_ID}`
const PBKDF2_ITERATIONS = 210_000
export const MIN_PASSPHRASE = 8

export interface StoredWallet {
  address: `0x${string}`
  salt: Hex
  iv: Hex
  ciphertext: Hex
}

/** Copies into a fresh ArrayBuffer-backed array, as WebCrypto's types require. */
const bytes = (h: Hex) => new Uint8Array(hexToBytes(h))

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations: PBKDF2_ITERATIONS },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export function loadStoredWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const w = JSON.parse(raw) as StoredWallet
    return isHex(w.ciphertext) && isHex(w.salt) && isHex(w.iv) ? w : null
  } catch {
    return null
  }
}

function saveStoredWallet(w: StoredWallet) {
  // Unlike settings, losing this loses funds: surface the failure.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
  } catch {
    throw new Error('This browser blocked storage, so the keeper wallet could not be saved. Use a normal (non-private) window.')
  }
}

export function clearStoredWallet() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing stored */ }
}

export function normalizePrivateKey(input: string): Hex {
  const k = input.trim()
  const hex = (k.startsWith('0x') ? k : `0x${k}`) as Hex
  if (!isHex(hex) || hex.length !== 66) throw new Error('A private key is 64 hex characters')
  return hex
}

/** Encrypts and saves `privateKey` (a new one when omitted); returns the unlocked account. */
export async function saveNewWallet(passphrase: string, privateKey?: Hex): Promise<PrivateKeyAccount> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE} characters`)
  const key = privateKey ?? generatePrivateKey()
  const account = privateKeyToAccount(key)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await deriveKey(passphrase, salt), bytes(key),
  )
  saveStoredWallet({
    address: account.address,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ct)),
  })
  return account
}

export async function decryptStoredWallet(stored: StoredWallet, passphrase: string): Promise<Hex> {
  let pt: ArrayBuffer
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(stored.iv) },
      await deriveKey(passphrase, bytes(stored.salt)),
      bytes(stored.ciphertext),
    )
  } catch {
    throw new Error('Wrong passphrase')
  }
  const key = bytesToHex(new Uint8Array(pt))
  if (privateKeyToAccount(key).address.toLowerCase() !== stored.address.toLowerCase()) {
    throw new Error('Stored wallet is corrupted')
  }
  return key
}
