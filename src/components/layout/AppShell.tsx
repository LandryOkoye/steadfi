/**
 * AppShell — persistent sidebar nav + top bar.
 * Design: ui-ux-pro-max DeFi dark, Space Grotesk headings, Inter body.
 */

import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ChartBar,
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowsClockwise,
  ArrowCircleUpRight,
  Wallet,
  ArrowUpRight,
  List,
  X,
  TestTube,
} from '@phosphor-icons/react'
import { ConnectKitButton } from 'connectkit'
import NetworkBadge from '../ui/NetworkBadge'
import GasEstimate from '../ui/GasEstimate'
import WrongNetworkBanner from '../ui/WrongNetworkBanner'

const NAV = [
  { to: '/markets',    label: 'Markets',    Icon: ChartBar },
  { to: '/supply',     label: 'Supply',     Icon: ArrowCircleDown },
  { to: '/borrow',     label: 'Borrow',     Icon: ArrowCircleUp },
  { to: '/repay',      label: 'Repay',      Icon: ArrowsClockwise },
  { to: '/withdraw',   label: 'Withdraw',   Icon: ArrowCircleUpRight },
  { to: '/positions',  label: 'Positions',  Icon: Wallet },
  { to: '/history',    label: 'History',    Icon: List },
  { to: '/bridge',     label: 'Bridge In',  Icon: ArrowUpRight },
]

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-dvh bg-[var(--color-background)]">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-56 border-r border-[var(--color-border)] bg-[var(--color-card)] shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[var(--color-border)]">
          <span className="font-heading text-xl font-700 text-[var(--color-primary)] tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}>
            Stead<span className="text-[var(--color-foreground)]">Fi</span>
          </span>
          <div className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">Arc Testnet</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto" aria-label="Main navigation">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-base rounded-none
                 ${isActive
                   ? 'bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold border-r-2 border-[var(--color-primary)]'
                   : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
                 }`
              }
            >
              <Icon size={18} weight={location.pathname.startsWith(to) ? 'fill' : 'regular'} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: gas estimate */}
        <div className="px-4 py-4 border-t border-[var(--color-border)]">
          <GasEstimate />
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-[var(--color-border)] bg-[var(--color-card)] sticky top-0 z-40">
          {/* Mobile menu button */}
          <button
            className="md:hidden text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-base"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <List size={22} />
          </button>

          {/* Mobile logo */}
          <span className="md:hidden font-heading text-lg font-700 text-[var(--color-primary)]"
                style={{ fontFamily: 'var(--font-heading)' }}>
            SteadFi
          </span>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <NetworkBadge />
            <ConnectKitButton />
          </div>
        </header>

        <WrongNetworkBanner />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <aside className="relative z-10 w-64 bg-[var(--color-card)] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <span className="font-heading text-lg text-[var(--color-primary)]"
                    style={{ fontFamily: 'var(--font-heading)' }}>SteadFi</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu"
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 py-3" aria-label="Mobile navigation">
              {NAV.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-3 text-sm transition-base
                     ${isActive
                       ? 'text-[var(--color-primary)] font-semibold bg-[var(--color-muted)]'
                       : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                     }`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3">
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[var(--color-accent)] hover:underline"
              >
                <TestTube size={14} aria-hidden="true" />
                Get testnet USDC
              </a>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
