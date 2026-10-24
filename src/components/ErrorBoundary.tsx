/**
 * ErrorBoundary — keeps a render crash in one page from blanking the app.
 */
import { Component, type ReactNode } from 'react'

interface State { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-dvh grid place-items-center bg-[var(--color-background)] p-4">
        <div className="max-w-sm w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-center space-y-3">
          <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Something went wrong</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            The page hit an unexpected error. Your funds are on-chain and unaffected.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-primary)] text-[var(--color-on-primary)] cursor-pointer"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
