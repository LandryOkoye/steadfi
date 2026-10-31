/**
 * Admin console — separate shell and routes under /admin, lazily loaded so the
 * public app never downloads it. Access is gated by on-chain roles; the
 * contracts enforce every permission regardless of what the UI shows.
 *
 * The Keeper page is ungated: keeper actions are permissionless and spend
 * only the keeper wallet's gas, so any connected wallet can run it. Every
 * other admin page stays behind RoleGate.
 */
import { NavLink, Navigate, Outlet, Route, Routes, Link } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import {
  ChartLineUp, SlidersHorizontal, Vault, UsersThree, Clock, ArrowLeft, ShieldCheck, Robot,
} from '@phosphor-icons/react'
import NetworkBadge from '../components/ui/NetworkBadge'
import Logo from '../components/ui/Logo'
import WrongNetworkBanner from '../components/ui/WrongNetworkBanner'
import { Card } from '../components/ui/Card'
import { useAdminRoles } from './useAdmin'
import { shortAddr } from './components'
import Overview from './pages/Overview'
import MarketsAdmin from './pages/MarketsAdmin'
import Treasury from './pages/Treasury'
import Access from './pages/Access'
import Governance from './pages/Governance'
import Keeper from './pages/Keeper'
import { KeeperProvider } from './keeper/KeeperProvider'
import { CONTRACTS } from '../lib/steadfi'

const NAV = [
  { to: '/admin/overview',   label: 'Overview',   Icon: ChartLineUp },
  { to: '/admin/markets',    label: 'Markets',    Icon: SlidersHorizontal },
  { to: '/admin/treasury',   label: 'Treasury',   Icon: Vault },
  { to: '/admin/access',     label: 'Access',     Icon: UsersThree },
  { to: '/admin/keeper',     label: 'Keeper',     Icon: Robot, open: true },
  ...(CONTRACTS.Timelock ? [{ to: '/admin/governance', label: 'Timelock', Icon: Clock }] : []),
]

function AdminShell() {
  const roles = useAdminRoles()
  // Non-admins (e.g. judges) only see the Keeper tab, which needs no role.
  const nav = roles.isAnyAdmin ? NAV : NAV.filter(n => 'open' in n)
  const badges = [
    roles.isOwner && 'Owner',
    roles.isRiskAdmin && 'Risk admin',
    roles.isPauseGuardian && 'Pause guardian',
    roles.isTimelockAdmin && 'Timelock admin',
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_85%,transparent)] backdrop-blur-xl">
        <div className="h-0.5 bg-[color-mix(in_srgb,var(--color-warning)_70%,transparent)]" aria-hidden="true" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 md:px-6 h-16">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={roles.isAnyAdmin ? '/admin/overview' : '/admin/keeper'} aria-label="Admin home"><Logo size={26} /></Link>
            <span className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
              <ShieldCheck size={13} aria-hidden="true" /> Admin console
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NetworkBadge />
            <ConnectKitButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 md:px-6" aria-label="Admin navigation">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition-base
                 ${isActive
                   ? 'border-[var(--color-warning)] text-[var(--color-foreground)] font-semibold'
                   : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`
              }
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <Link
            to="/markets"
            className="ml-auto flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft size={13} aria-hidden="true" /> User app
          </Link>
        </nav>
      </header>

      <WrongNetworkBanner />

      <main className="app-glow min-h-[calc(100dvh-7rem)]"><div className="mx-auto max-w-6xl p-4 md:p-6 md:py-10 space-y-5">
        {badges.length > 0 && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Your roles: <span className="text-[var(--color-foreground)] font-medium">{badges.join(' · ')}</span>
          </p>
        )}
        <Outlet />
      </div></main>
    </div>
  )
}

/** Shows the gated admin pages only to wallets holding an on-chain admin role. */
function RoleGate() {
  const { isConnected, address } = useAccount()
  const roles = useAdminRoles()

  if (!isConnected) {
    return (
      <GateMessage title="Admin console" body="Connect an admin wallet to continue. The Keeper tab works with any wallet.">
        <ConnectKitButton />
      </GateMessage>
    )
  }
  if (roles.loading) return <GateMessage title="Checking roles…" body="Reading your on-chain permissions." />
  if (!roles.isAnyAdmin && roles.error) {
    return (
      <GateMessage title="Couldn't check roles" body="The Arc RPC didn't answer. Your permissions are unknown, not denied.">
        <button onClick={roles.refetch} className="text-sm text-[var(--color-primary)] underline cursor-pointer">Retry</button>
      </GateMessage>
    )
  }
  if (!roles.isAnyAdmin) {
    return (
      <GateMessage
        title="Admin role required"
        body={`${address ? shortAddr(address) : 'This wallet'} has no admin role on the SteadFi LendingPool or Timelock. Keeper actions are permissionless, so you can still run the keeper.`}
      >
        <Link to="/admin/keeper" className="text-sm text-[var(--color-primary)] underline">Open the keeper console</Link>
      </GateMessage>
    )
  }
  return <Outlet />
}

function GateMessage({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center py-16">
      <Card className="max-w-sm w-full text-center space-y-3">
        <ShieldCheck size={28} className="mx-auto text-[var(--color-warning)]" aria-hidden="true" />
        <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{body}</p>
        {children && <div className="flex justify-center pt-1">{children}</div>}
      </Card>
    </div>
  )
}

export default function AdminApp() {
  return (
    <KeeperProvider>
      <Routes>
        <Route element={<AdminShell />}>
          {/* Keeper calls are permissionless and spend only the keeper wallet's gas. */}
          <Route path="keeper" element={<Keeper />} />
          <Route element={<RoleGate />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview"   element={<Overview />} />
            <Route path="markets"    element={<MarketsAdmin />} />
            <Route path="treasury"   element={<Treasury />} />
            <Route path="access"     element={<Access />} />
            <Route path="governance" element={<Governance />} />
            <Route path="*"          element={<Navigate to="overview" replace />} />
          </Route>
        </Route>
      </Routes>
    </KeeperProvider>
  )
}
