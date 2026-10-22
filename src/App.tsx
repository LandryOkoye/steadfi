/**
 * SteadFi — App root with React Router.
 * All routes render inside AppShell (sidebar nav + topbar).
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell  from './components/layout/AppShell'
import Markets   from './pages/Markets'
import Supply    from './pages/Supply'
import Borrow    from './pages/Borrow'
import Repay     from './pages/Repay'
import Withdraw  from './pages/Withdraw'
import Positions from './pages/Positions'
import History   from './pages/History'
import Bridge    from './pages/Bridge'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/markets" replace />} />
          <Route path="markets"   element={<Markets />} />
          <Route path="supply"    element={<Supply />} />
          <Route path="borrow"    element={<Borrow />} />
          <Route path="repay"     element={<Repay />} />
          <Route path="withdraw"  element={<Withdraw />} />
          <Route path="positions" element={<Positions />} />
          <Route path="history"   element={<History />} />
          <Route path="bridge"    element={<Bridge />} />
          <Route path="*"         element={<Navigate to="/markets" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
