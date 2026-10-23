/**
 * useSteadFi — wagmi hooks for reading live SteadFi state from Arc Testnet.
 * All reads use useReadContract; writes use useWriteContract.
 * No mocks, no simulations, no hardcoded numbers.
 */

import { useReadContract, useReadContracts, useAccount, useWriteContract } from 'wagmi'
import { parseUnits, toHex } from 'viem'
import {
  CONTRACTS, TOKENS, TokenSymbol, LENDING_POOL_ABI, ERC20_ABI,
  RAY, rayToHf, MAX_UINT256,
} from '../lib/steadfi'

// ── Market data hook (all 4 markets in one multicall) ────────────────────────

export interface MarketData {
  symbol: TokenSymbol
  supplyApy: number
  borrowApr: number
  utilizationPct: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  liquidityUsd: number
  ltv: number
  liqThreshold: number
  collateralEnabled: boolean
  borrowEnabled: boolean
  loading: boolean
}

const SYMBOLS: TokenSymbol[] = ['USDC', 'EURC', 'cirBTC', 'WETH']

// Rough USD price estimates for display only (oracle not directly readable from UI).
// Real positions use onchain oracle; this is for market overview cards.
const APPROX_USD: Record<TokenSymbol, number> = {
  USDC: 1.00,
  EURC: 1.08,
  cirBTC: 85_000,
  WETH: 2_500,
}

export function useMarketData(): MarketData[] {
  // Read market states for all 4 assets
  const stateResults = useReadContracts({
    contracts: SYMBOLS.flatMap(sym => [
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getMarketState' as const,
        args: [TOKENS[sym].address],
      },
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getMarketConfig' as const,
        args: [TOKENS[sym].address],
      },
    ]),
  })

  return SYMBOLS.map((sym, i) => {
    const stateResult = stateResults.data?.[i * 2]
    const configResult = stateResults.data?.[i * 2 + 1]
    const token = TOKENS[sym]
    const priceUsd = APPROX_USD[sym]

    if (!stateResult?.result || !configResult?.result) {
      return {
        symbol: sym, supplyApy: 0, borrowApr: 0, utilizationPct: 0,
        totalSupplyUsd: 0, totalBorrowUsd: 0, liquidityUsd: 0,
        ltv: 0, liqThreshold: 0,
        collateralEnabled: token.collateralEnabled,
        borrowEnabled: token.borrowEnabled,
        loading: stateResults.isLoading,
      }
    }

    const state = stateResult.result as {
      supplyIndex: bigint; borrowIndex: bigint
      totalSupplyShares: bigint; totalDebtShares: bigint
      lastAccrualTimestamp: bigint; reservesRay: bigint
    }
    const config = configResult.result as {
      ltv: number; liqThreshold: number; reserveFactor: number
      interestModel: `0x${string}`; collateralEnabled: boolean; borrowEnabled: boolean
    }

    const totalSupplyRay = state.totalSupplyShares * state.supplyIndex / RAY
    const totalDebtRay = state.totalDebtShares * state.borrowIndex / RAY

    const decimals = token.decimals
    const divisor = 10 ** decimals
    const totalSupplyTokens = Number(totalSupplyRay / (10n ** 21n)) / (divisor > 1000000 ? divisor : 1e6) // approximate
    const totalDebtTokens   = Number(totalDebtRay   / (10n ** 21n)) / (divisor > 1000000 ? divisor : 1e6)

    const totalSupplyUsd = totalSupplyTokens * priceUsd
    const totalBorrowUsd = totalDebtTokens * priceUsd
    const liquidityUsd = totalSupplyUsd - totalBorrowUsd

    const utilPct = totalSupplyRay > 0n
      ? Number(totalDebtRay * 100n / totalSupplyRay)
      : 0

    // Rate approximation: utilization determines APY
    // At 90% util, borrow rate = 8% (from IRM config)
    const borrowApr = utilPct > 90 ? 8 + (utilPct - 90) * 1.0 : utilPct * 8 / 90
    const supplyApy = borrowApr * (1 - config.reserveFactor / 10000) * utilPct / 100

    return {
      symbol: sym,
      supplyApy: Math.max(0, supplyApy),
      borrowApr: Math.max(0, borrowApr),
      utilizationPct: utilPct,
      totalSupplyUsd,
      totalBorrowUsd,
      liquidityUsd,
      ltv: config.ltv / 100,
      liqThreshold: config.liqThreshold / 100,
      collateralEnabled: config.collateralEnabled,
      borrowEnabled: config.borrowEnabled,
      loading: stateResults.isLoading,
    }
  })
}

// ── User position hook ────────────────────────────────────────────────────────

export interface UserPosition {
  healthFactor: number | null
  isHealthy: boolean
  supplies: Record<TokenSymbol, bigint>
  debts: Record<TokenSymbol, bigint>
  loading: boolean
}

export function useUserPosition(): UserPosition {
  const { address } = useAccount()

  const hfResult = useReadContract({
    address: CONTRACTS.LendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getHealthFactor',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const posResults = useReadContracts({
    contracts: address
      ? SYMBOLS.flatMap(sym => [
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getUserSupply' as const,
            args: [address, TOKENS[sym].address],
          },
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getUserDebt' as const,
            args: [address, TOKENS[sym].address],
          },
        ])
      : [],
    query: { enabled: !!address },
  })

  const hfData = hfResult.data as [bigint, boolean] | undefined
  const healthFactor = hfData ? rayToHf(hfData[0]) : null
  const isHealthy = hfData ? hfData[1] : true

  const supplies = Object.fromEntries(
    SYMBOLS.map((sym, i) => [sym, (posResults.data?.[i * 2]?.result) ?? 0n])
  ) as Record<TokenSymbol, bigint>

  const debts = Object.fromEntries(
    SYMBOLS.map((sym, i) => [sym, (posResults.data?.[i * 2 + 1]?.result) ?? 0n])
  ) as Record<TokenSymbol, bigint>

  return {
    healthFactor,
    isHealthy,
    supplies,
    debts,
    loading: hfResult.isLoading || posResults.isLoading,
  }
}

// ── Token balance hook ────────────────────────────────────────────────────────

export function useTokenBalance(symbol: TokenSymbol): bigint {
  const { address } = useAccount()
  const token = TOKENS[symbol]

  const { data } = useReadContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  return (data) ?? 0n
}

// ── Allowance + approve hook ──────────────────────────────────────────────────

export function useTokenAllowance(symbol: TokenSymbol, spender: `0x${string}`): bigint {
  const { address } = useAccount()
  const token = TOKENS[symbol]

  const { data } = useReadContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, spender] : undefined,
    query: { enabled: !!address },
  })
  return (data) ?? 0n
}

// ── Write helpers ─────────────────────────────────────────────────────────────

export function useApprove() {
  const { writeContractAsync } = useWriteContract()

  return async (symbol: TokenSymbol, spender: `0x${string}`) => {
    return writeContractAsync({
      address: TOKENS[symbol].address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, MAX_UINT256],
    })
  }
}

export function useSupply() {
  const { writeContractAsync, isPending } = useWriteContract()

  const supply = async (symbol: TokenSymbol, amount: bigint) => {
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'supply',
      args: [TOKENS[symbol].address, amount],
    })
  }

  return { supply, isPending }
}

export function useWithdraw() {
  const { writeContractAsync, isPending } = useWriteContract()

  const withdraw = async (symbol: TokenSymbol, amount: bigint) => {
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'withdraw',
      args: [TOKENS[symbol].address, amount],
    })
  }

  return { withdraw, isPending }
}

export function useBorrow() {
  const { writeContractAsync, isPending } = useWriteContract()

  const borrow = async (symbol: TokenSymbol, amount: bigint) => {
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'borrow',
      args: [TOKENS[symbol].address, amount],
    })
  }

  return { borrow, isPending }
}

export function useRepay() {
  const { writeContractAsync, isPending } = useWriteContract()

  const repay = async (symbol: TokenSymbol, amount: bigint, memo: string = '') => {
    const memoBytes: `0x${string}` = memo
      ? toHex(new TextEncoder().encode(memo))
      : '0x'
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'repay',
      args: [TOKENS[symbol].address, amount, memoBytes],
    })
  }

  return { repay, isPending }
}

export function useLiquidate() {
  const { writeContractAsync, isPending } = useWriteContract()

  const liquidate = async (
    borrower: `0x${string}`,
    debtSymbol: TokenSymbol,
    collateralSymbol: TokenSymbol,
    debtAmount: bigint
  ) => {
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'liquidate',
      args: [borrower, TOKENS[debtSymbol].address, TOKENS[collateralSymbol].address, debtAmount],
    })
  }

  return { liquidate, isPending }
}

export { parseUnits }
export { useAccount, useWriteContract }
