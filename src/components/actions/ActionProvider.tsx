/**
 * ActionProvider — opens the Supply / Withdraw / Borrow / Repay modals from
 * anywhere in the user app (dashboard rows, markets table, asset detail).
 */
import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import Modal from '../ui/Modal'
import TokenIcon from '../ui/TokenIcon'
import type { TokenSymbol } from '../../lib/steadfi'

export type ActionType = 'supply' | 'withdraw' | 'borrow' | 'repay'

interface ActionState { type: ActionType; symbol: TokenSymbol }

interface ActionContextValue {
  openAction: (type: ActionType, symbol: TokenSymbol) => void
}

const ActionContext = createContext<ActionContextValue | null>(null)

const SupplyForm   = lazy(() => import('./SupplyForm'))
const WithdrawForm = lazy(() => import('./WithdrawForm'))
const BorrowForm   = lazy(() => import('./BorrowForm'))
const RepayForm    = lazy(() => import('./RepayForm'))

const TITLES: Record<ActionType, string> = {
  supply: 'Supply', withdraw: 'Withdraw', borrow: 'Borrow', repay: 'Repay',
}

export interface ActionFormProps {
  symbol: TokenSymbol
  onDone: () => void
  setBusy: (busy: boolean) => void
}

export function ActionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActionState | null>(null)
  const [busy, setBusy] = useState(false)

  const openAction = useCallback((type: ActionType, symbol: TokenSymbol) => setState({ type, symbol }), [])
  const close = useCallback(() => { if (!busy) setState(null) }, [busy])
  const value = useMemo(() => ({ openAction }), [openAction])

  const Form = state
    ? { supply: SupplyForm, withdraw: WithdrawForm, borrow: BorrowForm, repay: RepayForm }[state.type]
    : null

  return (
    <ActionContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={close}
        locked={busy}
        title={state && (
          <span className="flex items-center gap-2.5">
            <TokenIcon symbol={state.symbol} size={26} />
            {TITLES[state.type]} {state.symbol}
          </span>
        )}
      >
        {state && Form && (
          <Suspense fallback={<div className="h-64 skeleton w-full" />}>
            <Form key={`${state.type}-${state.symbol}`} symbol={state.symbol} onDone={() => setState(null)} setBusy={setBusy} />
          </Suspense>
        )}
      </Modal>
    </ActionContext.Provider>
  )
}

export function useActions() {
  const ctx = useContext(ActionContext)
  if (!ctx) throw new Error('useActions must be used inside ActionProvider')
  return ctx
}
