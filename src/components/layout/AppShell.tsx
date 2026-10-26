/**
 * AppShell — user app frame: sticky glass top bar (Aave-style), page outlet
 * with the action modals provider, and a slim footer. Mobile gets a sheet menu.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { List, X, TestTube, ArrowSquareOut } from '@phosphor-icons/react'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import NetworkBadge from '../ui/NetworkBadge'
import GasEstimate from '../ui/GasEstimate'
import WrongNetworkBanner from '../ui/WrongNetworkBanner'
import Logo from '../ui/Logo'
import { ActionProvider } from '../actions/ActionProvider'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/markets',   label: 'Markets' },
  { to: '/bridge',    label: 'Bridge' },
  { to: '/history',   label: 'History' },
]

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close the mobile menu and reset scroll on navigation.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <ActionProvider>
      <div className="min-h-dvh flex flex-col bg-[var(--color-background)]">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--color-foreground)] focus:px-3 focus:py-2 focus:text-[var(--color-background)]">
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_80%,transparent)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 md:px-6">
            <Link to="/" aria-label="SteadFi home" className="shrink-0">
              <Logo />
            </Link>

            <nav className="hidden md:flex items-center gap-1 h-full" aria-label="Main">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `relative flex h-full items-center px-3 text-sm transition-base
                     ${isActive ? 'text-[var(--color-foreground)] font-semibold' : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {label}
                      {isActive && (
                        <motion.span
                          layoutId="nav-underline"
                          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[image:var(--gradient-brand)]"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <NetworkBadge />
              <ConnectKitButton />
              <button
                className="md:hidden grid h-10 w-10 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] cursor-pointer"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <List size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <WrongNetworkBanner />

        <main id="main" className="app-glow flex-1">
          <div className="mx-auto max-w-[1240px] px-4 md:px-6 py-6 md:py-10">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-[var(--color-border)]">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 md:px-6 pt-5 pb-20 text-xs text-[var(--color-muted-foreground)]">
            <span>SteadFi on Arc Testnet · Contracts not yet audited</span>
            <div className="flex items-center gap-4">
              <GasEstimate />
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]">
                Testnet faucet <ArrowSquareOut size={11} aria-hidden="true" />
              </a>
            </div>
          </div>
        </footer>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <motion.aside
                className="absolute right-0 top-0 h-full w-72 max-w-[85vw] border-l border-[var(--color-border)] bg-[var(--color-elevated)] flex flex-col"
                initial={{ x: '100%' }} animate={{ x: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } }}
                exit={{ x: '100%', transition: { duration: 0.18 } }}
                aria-label="Mobile navigation"
              >
                <div className="flex items-center justify-between px-5 h-16 border-b border-[var(--color-border)]">
                  <Logo size={24} />
                  <button onClick={() => setMenuOpen(false)} aria-label="Close menu"
                    className="grid h-10 w-10 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] cursor-pointer">
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>
                <nav className="flex-1 p-3">
                  {NAV.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `flex h-12 items-center rounded-xl px-4 text-[15px] transition-base
                         ${isActive ? 'bg-[var(--color-muted)] text-[var(--color-foreground)] font-semibold' : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </nav>
                <div className="border-t border-[var(--color-border)] p-5 space-y-3">
                  <GasEstimate />
                  <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-[var(--color-primary)] hover:underline">
                    <TestTube size={14} aria-hidden="true" /> Get testnet USDC
                  </a>
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ActionProvider>
  )
}
