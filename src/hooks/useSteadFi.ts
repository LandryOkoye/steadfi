/**
 * useSteadFi — wagmi hooks for reading live SteadFi state from Arc Testnet.
 * Every value here comes from a contract read. Prices come from the on-chain
 * PythOracleAdapter and rates from the market's interest-rate model.
 */

import { useReadContract, useReadContracts, useAccount, useWriteContract } from 'wagmi'
import { useEffect, useState } from 'react'
import { parseUnits, toHex } from 'viem'
import {
  CONTRACTS, TOKENS, TokenSymbol, LENDING_POOL_ABI, ERC20_ABI, ORACLE_ABI,
  RAY, rayToHf, MAX_UINT256, rayRateToApy, rayToPct,
  tokenAmountToNumber, usdFromTokenAmount, ARC_TESTNET_CHAIN_ID,
} from '../lib/steadfi'

export const SYMBOLS: TokenSymbol[] = ['USDC', 'EURC', 'cirBTC', 'WETH']

/**
 * Predefined loan durations (days) enforced by LendingPool.borrowWithTerm.
 * Keep in sync with the contract's isValidDuration.
 */
export const LOAN_DURATIONS_DAYS = [7, 14, 30, 60, 90, 180] as const

/**
 * Current wall-clock time for display purposes (due dates, overdue badges).
 * Reads the clock only from timer callbacks (never during render) and
 * refreshes every 60s. Returns 0 on the very first paint.
 */
export function useNowMs(): number {
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    const t0 = setTimeout(tick, 0)
    const t = setInterval(tick, 60_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [])
  return nowMs
}

// ── Oracle prices (1e18 USD; null means the feed reverted / is stale) ─────────

export interface OraclePriceState {
  prices: Record<TokenSymbol, bigint | null>
  loading: boolean
}

export function useOraclePrices(): OraclePriceState {
  const results = useReadContracts({
    contracts: SYMBOLS.map(sym => ({
      address: CONTRACTS.PythOracle,
      abi: ORACLE_ABI,
      functionName: 'getPrice' as const,
      args: [TOKENS[sym].address],
      chainId: ARC_TESTNET_CHAIN_ID,
    })),
    query: { refetchInterval: 12_000 },
  })

  const prices = {} as Record<TokenSymbol, bigint | null>
  SYMBOLS.forEach((sym, i) => {
    const r = results.data?.[i]
    prices[sym] = r?.status === 'success' ? r.result : null
  })

  return { prices, loading: results.isLoading }
}

// ── Market data hook (all 4 markets in one multicall) ────────────────────────

export interface MarketData {
  symbol: TokenSymbol
  priceUsd: number | null
  supplyApy: number
  borrowApr: number
  utilizationPct: number
  totalSupply: number
  totalDebt: number
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  liquidityUsd: number | null
  ltv: number
  liqThreshold: number
  collateralEnabled: boolean
  borrowEnabled: boolean
  loading: boolean
}

export function useMarketData(): MarketData[] {
  const { prices, loading: pricesLoading } = useOraclePrices()

  const stateResults = useReadContracts({
    contracts: SYMBOLS.flatMap(sym => [
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getMarketConfig' as const,
        args: [TOKENS[sym].address],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getMarketTotals' as const,
        args: [TOKENS[sym].address],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getMarketRates' as const,
        args: [TOKENS[sym].address],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
      {
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getUtilization' as const,
        args: [TOKENS[sym].address],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
    ]),
    query: { refetchInterval: 12_000 },
  })

  return SYMBOLS.map((sym, i) => {
    const cfgRes    = stateResults.data?.[i * 4]
    const totalsRes = stateResults.data?.[i * 4 + 1]
    const ratesRes  = stateResults.data?.[i * 4 + 2]
    const utilRes   = stateResults.data?.[i * 4 + 3]
    const token = TOKENS[sym]
    const price18 = prices[sym]

    if (
      cfgRes?.status !== 'success' ||
      totalsRes?.status !== 'success' ||
      ratesRes?.status !== 'success' ||
      utilRes?.status !== 'success'
    ) {
      return {
        symbol: sym, priceUsd: price18 ? Number(price18) / 1e18 : null,
        supplyApy: 0, borrowApr: 0, utilizationPct: 0,
        totalSupply: 0, totalDebt: 0,
        totalSupplyUsd: null, totalBorrowUsd: null, liquidityUsd: null,
        ltv: 0, liqThreshold: 0,
        collateralEnabled: token.collateralEnabled,
        borrowEnabled: token.borrowEnabled,
        loading: stateResults.isLoading || pricesLoading,
      }
    }

    const config = cfgRes.result as {
      ltv: number; liqThreshold: number; reserveFactor: number
      collateralEnabled: boolean; borrowEnabled: boolean
    }
    const totals = totalsRes.result as readonly [bigint, bigint]
    const rates  = ratesRes.result as readonly [bigint, bigint]
    const utilRay = utilRes.result as bigint

    const totalSupply = tokenAmountToNumber(totals[0], token.decimals)
    const totalDebt   = tokenAmountToNumber(totals[1], token.decimals)
    const totalSupplyUsd = price18 ? usdFromTokenAmount(totals[0], token.decimals, price18) : null
    const totalBorrowUsd = price18 ? usdFromTokenAmount(totals[1], token.decimals, price18) : null

    return {
      symbol: sym,
      priceUsd: price18 ? Number(price18) / 1e18 : null,
      supplyApy: rayRateToApy(rates[1]),
      borrowApr: rayRateToApy(rates[0]),
      utilizationPct: rayToPct(utilRay),
      totalSupply,
      totalDebt,
      totalSupplyUsd,
      totalBorrowUsd,
      liquidityUsd: totalSupplyUsd !== null && totalBorrowUsd !== null
        ? totalSupplyUsd - totalBorrowUsd
        : null,
      ltv: config.ltv / 100,
      liqThreshold: config.liqThreshold / 100,
      collateralEnabled: config.collateralEnabled,
      borrowEnabled: config.borrowEnabled,
      loading: false,
    }
  })
}

// ── User position hook ────────────────────────────────────────────────────────

export interface UserPosition {
  healthFactor: number | null
  isHealthy: boolean
  supplies: Record<TokenSymbol, bigint>
  debts: Record<TokenSymbol, bigint>
  /** Max total debt allowed, in Ray USD (1e18 = $1). */
  borrowPowerRay: bigint
  /** Current total debt, in Ray USD. */
  totalDebtRay: bigint
  loading: boolean
}

export function useUserPosition(): UserPosition {
  const { address } = useAccount()

  const hfResult = useReadContract({
    address: CONTRACTS.LendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getHealthFactor',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 12_000 },
  })

  const summaryResults = useReadContracts({
    contracts: address
      ? [
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getBorrowPower' as const,
            args: [address],
            chainId: ARC_TESTNET_CHAIN_ID,
          },
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getTotalDebt' as const,
            args: [address],
            chainId: ARC_TESTNET_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  })

  const posResults = useReadContracts({
    contracts: address
      ? SYMBOLS.flatMap(sym => [
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getUserSupply' as const,
            args: [address, TOKENS[sym].address],
            chainId: ARC_TESTNET_CHAIN_ID,
          },
          {
            address: CONTRACTS.LendingPool,
            abi: LENDING_POOL_ABI,
            functionName: 'getUserDebt' as const,
            args: [address, TOKENS[sym].address],
            chainId: ARC_TESTNET_CHAIN_ID,
          },
        ])
      : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  })

  const hfData = hfResult.data
  const totalDebtRay = summaryResults.data?.[1]?.result ?? 0n
  const hasDebt = totalDebtRay > 0n
  const healthFactor = hfData && hasDebt ? rayToHf(hfData[0]) : null
  const isHealthy = hfData ? hfData[1] : true

  const supplies = Object.fromEntries(
    SYMBOLS.map((sym, i) => [sym, posResults.data?.[i * 2]?.result ?? 0n])
  ) as Record<TokenSymbol, bigint>

  const debts = Object.fromEntries(
    SYMBOLS.map((sym, i) => [sym, posResults.data?.[i * 2 + 1]?.result ?? 0n])
  ) as Record<TokenSymbol, bigint>

  return {
    healthFactor,
    isHealthy,
    supplies,
    debts,
    borrowPowerRay: summaryResults.data?.[0]?.result ?? 0n,
    totalDebtRay,
    loading: hfResult.isLoading || posResults.isLoading || summaryResults.isLoading,
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
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 12_000 },
  })
  return data ?? 0n
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
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 12_000 },
  })
  return data ?? 0n
}

// ── Loan term hook ─────────────────────────────────────────────────────────────

export interface LoanTerm {
  borrowedAt: bigint
  durationDays: number
  dueTimestamp: bigint
  /** ISO date string of the due date; null when no term is set. */
  dueDate: string | null
}

/** Active fixed-term metadata for the connected user's debt in `symbol`. */
export function useLoanTerm(symbol: TokenSymbol): LoanTerm | null {
  const { address } = useAccount()

  const { data } = useReadContract({
    address: CONTRACTS.LendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getLoanTerm',
    args: address ? [address, TOKENS[symbol].address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 12_000 },
  })

  if (!data) return null
  const [borrowedAtRaw, durationDaysRaw, dueRaw] = data as unknown as readonly [bigint, bigint, bigint]
  const durationDays = Number(durationDaysRaw)
  const dueTimestamp = dueRaw
  return {
    borrowedAt: borrowedAtRaw,
    durationDays,
    dueTimestamp,
    dueDate: durationDays > 0 && dueTimestamp > 0n
      ? new Date(Number(dueTimestamp) * 1000).toISOString()
      : null,
  }
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
      chainId: ARC_TESTNET_CHAIN_ID,
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
      chainId: ARC_TESTNET_CHAIN_ID,
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
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { withdraw, isPending }
}

export function useBorrow() {
  const { writeContractAsync, isPending } = useWriteContract()

  /** `durationDays` 0 = open-ended borrow; otherwise one of LOAN_DURATIONS_DAYS. */
  const borrow = async (symbol: TokenSymbol, amount: bigint, durationDays: number = 0) => {
    return writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: durationDays > 0 ? 'borrowWithTerm' : 'borrow',
      args:
        durationDays > 0
          ? [TOKENS[symbol].address, amount, durationDays]
          : [TOKENS[symbol].address, amount],
      chainId: ARC_TESTNET_CHAIN_ID,
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
      chainId: ARC_TESTNET_CHAIN_ID,
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
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { liquidate, isPending }
}

export { parseUnits }
export { useAccount, useWriteContract }
export { RAY }
